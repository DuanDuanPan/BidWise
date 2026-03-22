#!/usr/bin/env python3
import argparse
import os
import pty
import re
import select
import signal
import sys
import time

PROMPT_RE = re.compile(r"(^|\n)\s*(?:❯|›|➜).*$|(^|\n)\s*codex>.*$|(^|\n)\s*\$\s*$", re.MULTILINE)
ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]|\x1b\][^\x07]*\x07")
DONE_RE = re.compile(r"^MC_DONE .*$")
HALT_RE = re.compile(r"^HALT.*$")


def clean_text(text: str) -> str:
    return ANSI_RE.sub("", text)


def emit_marker(line: str) -> None:
    sys.stdout.write(f"{line}\n")
    sys.stdout.flush()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--agent-command", required=True)
    parser.add_argument("--packet-file", required=True)
    parser.add_argument("--ready-timeout", type=int, default=30)
    args = parser.parse_args()

    with open(args.packet_file, "r", encoding="utf-8") as fh:
      packet = fh.read()

    pid, fd = pty.fork()
    if pid == 0:
        os.execvp("/bin/sh", ["sh", "-lc", args.agent_command])

    child_exited = False
    ready = False
    packet_submitted = False
    packet_acked = False
    worker_running = False
    clean_tail = ""
    clean_lines = ""
    started = time.time()

    def forward_signal(signum, _frame):
        try:
            os.kill(pid, signum)
        except OSError:
            pass

    signal.signal(signal.SIGTERM, forward_signal)
    signal.signal(signal.SIGINT, forward_signal)

    while True:
        if not ready and time.time() - started > args.ready_timeout:
            emit_marker("HALT WRAPPER READY_TIMEOUT")
            try:
                os.kill(pid, signal.SIGTERM)
            except OSError:
                pass
            return 1

        rlist, _, _ = select.select([fd], [], [], 0.2)
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

                if not ready and PROMPT_RE.search(clean_tail):
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
