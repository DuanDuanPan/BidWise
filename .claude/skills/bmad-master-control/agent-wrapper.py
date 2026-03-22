#!/usr/bin/env python3
import argparse
import fcntl
import os
import pty
import re
import select
import signal
import struct
import sys
import termios
import time

PROMPT_RE = re.compile(r"(^|\n)\s*(?:❯|›|➜).*$|(^|\n)\s*codex>.*$|(^|\n)\s*\$\s*$", re.MULTILINE)
READY_RE = re.compile(
    r"(^|\n)\s*gpt-[^\n]{0,120}·\s*100%\s*left[^\n]*$",
    re.MULTILINE,
)
CSI_RE = re.compile(r"\x1b\[[0-9;?]*[ -/]*[@-~]")
OSC_RE = re.compile(r"\x1b\][^\x07]*\x07")
ESC_RE = re.compile(r"\x1b[@-_]")
CURSOR_BREAK_RE = re.compile(r"\x1b\[[0-9;?]*[HfJ]")
DONE_RE = re.compile(r"^MC_DONE .*$")
HALT_RE = re.compile(r"^HALT.*$")


def clean_text(text: str) -> str:
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = CURSOR_BREAK_RE.sub("\n", text)
    text = text.replace("\x1bM", "\n")
    text = OSC_RE.sub("", text)
    text = CSI_RE.sub("", text)
    text = ESC_RE.sub("", text)
    while "\b" in text:
        next_text = re.sub(r"[^\n]\x08", "", text)
        if next_text == text:
            break
        text = next_text
    return text.replace("\x08", "")


def emit_marker(line: str) -> None:
    sys.stdout.write(f"{line}\n")
    sys.stdout.flush()


def ready_detected(text: str) -> bool:
    return bool(PROMPT_RE.search(text) or READY_RE.search(text))


def sync_winsize(dst_fd: int) -> None:
    for src_fd in (sys.stdout.fileno(), sys.stdin.fileno()):
        try:
            packed = fcntl.ioctl(src_fd, termios.TIOCGWINSZ, b"\0" * 8)
            rows, cols, xpix, ypix = struct.unpack("HHHH", packed)
            if rows > 0 and cols > 0:
                fcntl.ioctl(dst_fd, termios.TIOCSWINSZ, struct.pack("HHHH", rows, cols, xpix, ypix))
                return
        except OSError:
            continue


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--agent-command", required=True)
    parser.add_argument("--packet-file", required=True)
    parser.add_argument("--ready-timeout", type=int, default=30)
    parser.add_argument("--control-fifo", default=None)
    parser.add_argument("--long-lived", action="store_true")
    parser.add_argument("--ready-match", default=None)
    parser.add_argument("--ready-emit", default=None)
    parser.add_argument("--boot-token-file", default=None)
    args = parser.parse_args()

    with open(args.packet_file, "r", encoding="utf-8") as fh:
      packet = fh.read()

    control_fd = None
    if args.control_fifo:
        control_fd = os.open(args.control_fifo, os.O_RDWR | os.O_NONBLOCK)

    pid, fd = pty.fork()
    if pid == 0:
        os.execvp("/bin/sh", ["sh", "-lc", args.agent_command])
    sync_winsize(fd)

    boot_id = f"{os.getpid()}-{int(time.time())}"
    if args.boot_token_file:
        with open(args.boot_token_file, "w") as f:
            f.write(f"wrapper_pid={os.getpid()}\n")
            f.write(f"boot_id={boot_id}\n")
            f.write(f"started={time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}\n")

    child_exited = False
    ready = False
    packet_submitted = False
    packet_acked = False
    worker_running = False
    clean_tail = ""
    clean_lines = ""
    ready_sentinel_emitted = False
    started = time.time()

    def forward_signal(signum, _frame):
        try:
            os.kill(pid, signum)
        except OSError:
            pass

    signal.signal(signal.SIGTERM, forward_signal)
    signal.signal(signal.SIGINT, forward_signal)
    signal.signal(signal.SIGWINCH, lambda _signum, _frame: sync_winsize(fd))

    while True:
        if not ready and time.time() - started > args.ready_timeout:
            emit_marker("HALT WRAPPER READY_TIMEOUT")
            try:
                os.kill(pid, signal.SIGTERM)
            except OSError:
                pass
            return 1

        fds_to_watch = [fd]
        if control_fd is not None:
            fds_to_watch.append(control_fd)

        rlist, _, _ = select.select(fds_to_watch, [], [], 0.2)
        if fd in rlist:
            try:
                data = os.read(fd, 4096)
            except OSError:
                data = b""

            if not data:
                child_exited = True
            else:
                sys.stdout.buffer.write(data)
                sys.stdout.buffer.flush()

                decoded = data.decode("utf-8", errors="ignore")
                clean_chunk = clean_text(decoded)
                clean_tail = (clean_tail + clean_chunk)[-4000:]
                clean_lines += clean_chunk

                if not ready and ready_detected(clean_tail):
                    ready = True
                    emit_marker("MC_STATE AGENT_READY")
                    os.write(fd, packet.encode("utf-8", errors="ignore"))
                    if not packet.endswith("\n"):
                        os.write(fd, b"\n")
                    os.write(fd, b"\r")
                    packet_submitted = True
                    emit_marker("MC_STATE PACKET_SUBMITTED")
                    clean_lines = ""
                    continue

                if packet_submitted and not packet_acked and clean_chunk.strip():
                    packet_acked = True
                    emit_marker("MC_STATE PACKET_ACKED")

                if packet_acked and not worker_running and clean_chunk.strip():
                    worker_running = True
                    emit_marker("MC_STATE WORKER_RUNNING")

                parts = re.split(r"[\r\n]+", clean_lines)
                clean_lines = parts.pop() if parts else ""
                for raw in parts:
                    line = raw.strip()
                    if not line:
                        continue
                    if DONE_RE.match(line):
                        emit_marker(line)
                    elif HALT_RE.match(line):
                        emit_marker(line)

                if args.ready_match and not ready_sentinel_emitted:
                    if args.ready_match in clean_tail:
                        emit_marker(f"MC_STATE {args.ready_emit or args.ready_match}")
                        ready_sentinel_emitted = True

        if control_fd is not None and control_fd in rlist:
            try:
                control_data = os.read(control_fd, 8192)
                if control_data:
                    os.write(fd, control_data)
                    if not control_data.endswith(b"\n"):
                        os.write(fd, b"\n")
            except OSError:
                pass

        if child_exited:
            break

        waited_pid, status = os.waitpid(pid, os.WNOHANG)
        if waited_pid == pid:
            child_exited = True
            if not packet_acked:
                emit_marker("MC_STATE PROCESS_EXIT_BEFORE_ACK")
            elif not worker_running:
                emit_marker("MC_STATE PROCESS_EXIT_AFTER_ACK")
            break

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
