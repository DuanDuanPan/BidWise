#!/usr/bin/env python3
import argparse
import fcntl
import json
import os
import pty
import re
import select
import signal
import struct
import sys
import termios
import time
from collections import deque

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
WORKER_READY_RE = re.compile(r"^MC_WORKER_READY\s+(\S+)\s*$")
ACK_RE = re.compile(r"^MC_ACK\s+(\S+)\s*$")
BEGIN_RE = re.compile(r"^MC_BEGIN\s+(\S+)\s*$")
TASK_BLOCK_RE = re.compile(r"\ATASK\s+(\S+)\s+(\S+)\s+(\S+)\n(.*?)\nEND_TASK(?:\n|$)", re.DOTALL)


def env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        return float(default)


def env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        return int(default)


PROMPT_STABLE_DELAY_SEC = env_float("MC_AGENT_PROMPT_STABLE_SEC", 0.75)
WRITE_TIMEOUT_SEC = env_float("MC_AGENT_WRITE_TIMEOUT", 5.0)
WRITE_CHUNK_SIZE = max(256, env_int("MC_AGENT_WRITE_CHUNK_SIZE", 1024))
POST_PASTE_ENTER_DELAY_SEC = env_float("MC_AGENT_ENTER_DELAY", 0.15)


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


def diagnostics_log_path(packet_file: str, boot_token_file: str | None) -> str | None:
    candidates = [boot_token_file, packet_file]
    for candidate in candidates:
        if not candidate:
            continue
        current = os.path.abspath(os.path.dirname(candidate))
        while True:
            if os.path.basename(current) == "implementation-artifacts":
                return os.path.join(current, "master-control-diagnostics.log")
            parent = os.path.dirname(current)
            if parent == current:
                break
            current = parent
    return None


def excerpt(text: str, max_chars: int = 600) -> str:
    text = text or ""
    if len(text) <= max_chars:
        return text
    return text[-max_chars:]


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


def write_with_timeout(fd: int, payload: bytes, timeout_sec: float = WRITE_TIMEOUT_SEC) -> int:
    if not payload:
        return 0

    flags = fcntl.fcntl(fd, fcntl.F_GETFL)
    total_written = 0
    view = memoryview(payload)
    deadline = time.monotonic() + timeout_sec

    try:
        fcntl.fcntl(fd, fcntl.F_SETFL, flags | os.O_NONBLOCK)
        while total_written < len(payload):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"pty write timed out after {timeout_sec:.2f}s")

            _, writable, _ = select.select([], [fd], [], min(0.25, remaining))
            if not writable:
                continue

            try:
                written = os.write(fd, view[total_written : total_written + WRITE_CHUNK_SIZE])
            except BlockingIOError:
                continue

            if written <= 0:
                raise TimeoutError("pty write made no progress")

            total_written += written
    finally:
        fcntl.fcntl(fd, fcntl.F_SETFL, flags)

    return total_written


def submit_paste(fd: int, text: str) -> None:
    payload = text.encode("utf-8", errors="ignore")
    write_with_timeout(fd, b"\x1b[200~")
    write_with_timeout(fd, payload)
    if not payload.endswith(b"\n"):
        write_with_timeout(fd, b"\n")
    write_with_timeout(fd, b"\x1b[201~")
    if POST_PASTE_ENTER_DELAY_SEC > 0:
        time.sleep(POST_PASTE_ENTER_DELAY_SEC)
    write_with_timeout(fd, b"\r", timeout_sec=max(1.0, WRITE_TIMEOUT_SEC / 2))


def parse_task_blocks(buffer: str):
    tasks = []
    remaining = buffer
    while remaining:
        remaining = remaining.lstrip("\r\n")
        if not remaining:
            break
        task_pos = remaining.find("TASK ")
        if task_pos == -1:
            return tasks, remaining
        if task_pos > 0:
            remaining = remaining[task_pos:]
        match = TASK_BLOCK_RE.match(remaining)
        if not match:
            return tasks, remaining
        tasks.append(
            {
                "task_id": match.group(1),
                "phase": match.group(2),
                "story_id": match.group(3),
                "block": match.group(0),
            }
        )
        remaining = remaining[match.end() :]
    return tasks, remaining


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
    parser.add_argument("--protocol-worker", action="store_true")
    parser.add_argument("--worker-id", default=None)
    parser.add_argument("--bootstrap-timeout", type=int, default=10)
    parser.add_argument("--bootstrap-retries", type=int, default=3)
    parser.add_argument("--ack-timeout", type=int, default=20)
    parser.add_argument("--begin-timeout", type=int, default=120)
    args = parser.parse_args()
    diag_path = diagnostics_log_path(args.packet_file, args.boot_token_file)

    def diag_log(event: str, **fields) -> None:
        if not diag_path:
            return
        entry = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "script": "agent-wrapper.py",
            "pid": os.getpid(),
            "event": event,
            "protocol_worker": args.protocol_worker,
            "worker_id": args.worker_id or "",
        }
        entry.update(fields)
        try:
            os.makedirs(os.path.dirname(diag_path), exist_ok=True)
            with open(diag_path, "a", encoding="utf-8") as f:
                fcntl.flock(f.fileno(), fcntl.LOCK_EX)
                f.write(json.dumps(entry, ensure_ascii=True) + "\n")
                f.flush()
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        except OSError:
            return

    with open(args.packet_file, "r", encoding="utf-8") as fh:
        packet = fh.read()

    control_fd = None
    if args.control_fifo:
        control_fd = os.open(args.control_fifo, os.O_RDWR | os.O_NONBLOCK)

    pid, fd = pty.fork()
    if pid == 0:
        os.execvp("/bin/sh", ["sh", "-lc", args.agent_command])
    sync_winsize(fd)
    diag_log(
        "spawned",
        child_pid=pid,
        agent_command=args.agent_command,
        packet_file=args.packet_file,
        boot_token_file=args.boot_token_file or "",
        control_fifo=args.control_fifo or "",
        ready_timeout=args.ready_timeout,
        bootstrap_timeout=args.bootstrap_timeout,
        bootstrap_retries=args.bootstrap_retries,
    )

    boot_id = f"{os.getpid()}-{int(time.time())}"
    boot_token = {
        "wrapper_pid": str(os.getpid()),
        "boot_id": boot_id,
        "started": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "mode": "protocol_worker" if args.protocol_worker else "legacy",
    }
    if args.worker_id:
        boot_token["worker_id"] = args.worker_id

    def persist_boot_token(**updates) -> None:
        if not args.boot_token_file:
            return
        boot_token.update({k: str(v) for k, v in updates.items()})
        with open(args.boot_token_file, "w", encoding="utf-8") as f:
            for key, value in boot_token.items():
                f.write(f"{key}={value}\n")
        diag_log(
            "boot_token.write",
            status=boot_token.get("status", ""),
            boot_token_file=args.boot_token_file,
            bootstrap_attempts=boot_token.get("bootstrap_attempts", ""),
            task_id=boot_token.get("task_id", ""),
            phase=boot_token.get("phase", ""),
            story_id=boot_token.get("story_id", ""),
            updates=updates,
        )

    persist_boot_token()

    child_exited = False
    agent_prompt_ready = False
    clean_tail = ""
    clean_lines = ""
    started = time.time()
    last_output_at = started
    prompt_ready_at = 0.0

    packet_submitted = False
    packet_acked = False
    worker_running = False
    ready_sentinel_emitted = False
    echo_skip_until = 0.0

    bootstrap_sent_at = 0.0
    bootstrap_attempts = 0
    worker_ready = False
    control_buffer = ""
    pending_tasks = deque()
    current_task = None

    def forward_signal(signum, _frame):
        try:
            os.kill(pid, signum)
        except OSError:
            pass

    def submit_bootstrap() -> None:
        nonlocal bootstrap_sent_at, bootstrap_attempts, clean_lines
        attempt = bootstrap_attempts + 1
        now = time.time()
        stable_for = max(0.0, now - max(prompt_ready_at, last_output_at))
        diag_log(
            "bootstrap.submit.begin",
            bootstrap_attempt=attempt,
            stable_for=round(stable_for, 3),
            packet_chars=len(packet),
            clean_tail=excerpt(clean_tail),
        )
        try:
            submit_paste(fd, packet)
        except Exception as exc:
            bootstrap_sent_at = time.time()
            bootstrap_attempts = attempt
            clean_lines = ""
            persist_boot_token(status="bootstrap_submit_failed", bootstrap_attempts=bootstrap_attempts)
            diag_log(
                "bootstrap.submit_failed",
                bootstrap_attempt=attempt,
                error_type=type(exc).__name__,
                error=str(exc),
                clean_tail=excerpt(clean_tail),
            )
            return

        bootstrap_sent_at = time.time()
        bootstrap_attempts = attempt
        clean_lines = ""
        persist_boot_token(status="bootstrap_sent", bootstrap_attempts=bootstrap_attempts)
        diag_log(
            "bootstrap.submitted",
            bootstrap_attempt=bootstrap_attempts,
            packet_chars=len(packet),
            packet_head=(packet.splitlines()[0] if packet else ""),
            clean_tail=excerpt(clean_tail),
        )

    def clear_current_task() -> None:
        nonlocal current_task
        current_task = None
        persist_boot_token(status="worker_ready")

    def mark_worker_ready() -> None:
        nonlocal worker_ready
        if worker_ready:
            return
        worker_ready = True
        persist_boot_token(
            status="worker_ready",
            ready_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        )
        emit_marker("MC_STATE WORKER_READY")
        diag_log("worker.ready", clean_tail=excerpt(clean_tail))

    def mark_task_acked() -> None:
        if not current_task or current_task["acked"]:
            return
        current_task["acked"] = True
        current_task["acked_at"] = time.time()
        persist_boot_token(status="task_acked", task_id=current_task["task_id"])
        emit_marker("MC_STATE TASK_ACKED")

    def mark_task_started() -> None:
        if not current_task or current_task["started"] or not current_task["acked"]:
            return
        current_task["started"] = True
        persist_boot_token(status="task_started", task_id=current_task["task_id"])
        emit_marker("MC_STATE TASK_STARTED")

    def maybe_start_next_task() -> None:
        nonlocal current_task
        if not args.protocol_worker or not worker_ready or current_task or not pending_tasks:
            return
        current_task = pending_tasks.popleft()
        current_task["sent_at"] = time.time()
        current_task["acked"] = False
        current_task["started"] = False
        current_task["acked_at"] = 0.0
        try:
            submit_paste(fd, current_task["block"])
        except Exception as exc:
            diag_log(
                "task.submit_failed",
                task_id=current_task["task_id"],
                phase=current_task["phase"],
                story_id=current_task["story_id"],
                error_type=type(exc).__name__,
                error=str(exc),
                clean_tail=excerpt(clean_tail),
            )
            emit_marker(f"HALT {current_task['task_id']} TASK_SUBMIT_FAILED")
            clear_current_task()
            return
        persist_boot_token(
            status="task_sent",
            task_id=current_task["task_id"],
            phase=current_task["phase"],
            story_id=current_task["story_id"],
        )

    signal.signal(signal.SIGTERM, forward_signal)
    signal.signal(signal.SIGINT, forward_signal)
    signal.signal(signal.SIGWINCH, lambda _signum, _frame: sync_winsize(fd))

    while True:
        now = time.time()

        if not agent_prompt_ready and now - started > args.ready_timeout:
            diag_log("wrapper.ready_timeout", clean_tail=excerpt(clean_tail), clean_lines=excerpt(clean_lines))
            emit_marker("HALT WRAPPER READY_TIMEOUT")
            try:
                os.kill(pid, signal.SIGTERM)
            except OSError:
                pass
            return 1

        if args.protocol_worker and agent_prompt_ready and not worker_ready:
            terminal_stable = now - max(prompt_ready_at, last_output_at) >= PROMPT_STABLE_DELAY_SEC
            if not terminal_stable:
                pass
            elif bootstrap_attempts == 0:
                submit_bootstrap()
            elif now - bootstrap_sent_at > args.bootstrap_timeout:
                if bootstrap_attempts >= args.bootstrap_retries:
                    diag_log(
                        "bootstrap.timeout",
                        bootstrap_attempts=bootstrap_attempts,
                        clean_tail=excerpt(clean_tail),
                        clean_lines=excerpt(clean_lines),
                    )
                    emit_marker("HALT WRAPPER BOOTSTRAP_TIMEOUT")
                    try:
                        os.kill(pid, signal.SIGTERM)
                    except OSError:
                        pass
                    return 1
                diag_log(
                    "bootstrap.retrying",
                    bootstrap_attempts=bootstrap_attempts,
                    clean_tail=excerpt(clean_tail),
                )
                submit_bootstrap()

        if args.protocol_worker and current_task:
            if not current_task["acked"] and time.time() - current_task["sent_at"] > args.ack_timeout:
                emit_marker(f"HALT {current_task['task_id']} NO_ACK")
                clear_current_task()
            elif (
                current_task["acked"]
                and not current_task["started"]
                and time.time() - current_task["acked_at"] > args.begin_timeout
            ):
                emit_marker(f"HALT {current_task['task_id']} NO_BEGIN")
                clear_current_task()

        maybe_start_next_task()

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
                last_output_at = time.time()

                if not agent_prompt_ready and ready_detected(clean_tail):
                    agent_prompt_ready = True
                    prompt_ready_at = last_output_at
                    diag_log("agent.prompt_ready", clean_tail=excerpt(clean_tail))
                    if not args.protocol_worker:
                        emit_marker("MC_STATE AGENT_READY")
                        submit_paste(fd, packet)
                        packet_submitted = True
                        echo_skip_until = time.time() + 10.0
                        emit_marker("MC_STATE PACKET_SUBMITTED")
                        diag_log("packet.submitted", packet_chars=len(packet), clean_tail=excerpt(clean_tail))
                        clean_lines = ""
                        continue

                if not args.protocol_worker:
                    if packet_submitted and not packet_acked and clean_chunk.strip():
                        packet_acked = True
                        emit_marker("MC_STATE PACKET_ACKED")
                        diag_log("packet.acked", clean_tail=excerpt(clean_tail))

                    if packet_acked and not worker_running and clean_chunk.strip():
                        worker_running = True
                        emit_marker("MC_STATE WORKER_RUNNING")
                        diag_log("worker.running", clean_tail=excerpt(clean_tail))

                    if echo_skip_until > 0 and time.time() < echo_skip_until:
                        clean_lines = ""
                    elif echo_skip_until > 0 and time.time() >= echo_skip_until:
                        echo_skip_until = 0.0
                        clean_lines = ""
                    else:
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

                    if args.ready_match and not ready_sentinel_emitted and args.ready_match in clean_tail:
                        emit_marker(f"MC_STATE {args.ready_emit or args.ready_match}")
                        ready_sentinel_emitted = True
                    continue

                if not worker_ready and args.worker_id:
                    if re.search(rf"MC_WORKER_READY\s+{re.escape(args.worker_id)}(?:\s|$)", clean_tail):
                        mark_worker_ready()

                if current_task and not current_task["acked"]:
                    task_terminal_seen = re.search(rf"HALT\s+{re.escape(current_task['task_id'])}(?:\s|$)", clean_tail) or re.search(
                        r"MC_DONE\s+\S+\s+\S+\s+\S+(?:\s|$)", clean_tail
                    )
                    if re.search(rf"MC_ACK\s+{re.escape(current_task['task_id'])}(?:\s|$)", clean_tail) or re.search(
                        rf"MC_BEGIN\s+{re.escape(current_task['task_id'])}(?:\s|$)", clean_tail
                    ) or task_terminal_seen:
                        mark_task_acked()

                if current_task and current_task["acked"] and not current_task["started"]:
                    if re.search(rf"MC_BEGIN\s+{re.escape(current_task['task_id'])}(?:\s|$)", clean_tail) or re.search(
                        r"MC_DONE\s+\S+\s+\S+\s+\S+(?:\s|$)", clean_tail
                    ) or re.search(rf"HALT\s+{re.escape(current_task['task_id'])}(?:\s|$)", clean_tail):
                        mark_task_started()

                parts = re.split(r"[\r\n]+", clean_lines)
                clean_lines = parts.pop() if parts else ""
                for raw in parts:
                    line = raw.strip()
                    if not line:
                        continue

                    if not worker_ready:
                        ready_match = WORKER_READY_RE.match(line)
                        if ready_match and ready_match.group(1) == (args.worker_id or ready_match.group(1)):
                            mark_worker_ready()
                        elif HALT_RE.match(line):
                            emit_marker(line)
                        continue

                    if current_task:
                        ack_match = ACK_RE.match(line)
                        if ack_match and ack_match.group(1) == current_task["task_id"] and not current_task["acked"]:
                            mark_task_acked()
                            continue

                        begin_match = BEGIN_RE.match(line)
                        if (
                            begin_match
                            and begin_match.group(1) == current_task["task_id"]
                            and current_task["acked"]
                            and not current_task["started"]
                        ):
                            mark_task_started()
                            continue

                        if DONE_RE.match(line):
                            if not current_task["acked"]:
                                mark_task_acked()
                            if not current_task["started"]:
                                mark_task_started()
                            clear_current_task()
                            continue

                        halt_match = HALT_RE.match(line)
                        if halt_match:
                            if not current_task["acked"]:
                                mark_task_acked()
                            if not current_task["started"]:
                                mark_task_started()
                            clear_current_task()
                            continue

        if control_fd is not None and control_fd in rlist:
            try:
                chunks = []
                while True:
                    try:
                        chunk = os.read(control_fd, 65536)
                        if chunk:
                            chunks.append(chunk)
                        else:
                            break
                    except BlockingIOError:
                        break
                    except OSError:
                        break
                if chunks:
                    control_data = b"".join(chunks)
                    if args.protocol_worker:
                        control_buffer += control_data.decode("utf-8", errors="ignore")
                        parsed_tasks, control_buffer = parse_task_blocks(control_buffer)
                        pending_tasks.extend(parsed_tasks)
                        maybe_start_next_task()
                    else:
                        submit_paste(fd, control_data.decode("utf-8", errors="ignore"))
            except OSError:
                pass

        if child_exited:
            break

        waited_pid, _status = os.waitpid(pid, os.WNOHANG)
        if waited_pid == pid:
            child_exited = True
            diag_log(
                "child.exit",
                child_pid=pid,
                worker_ready=worker_ready,
                current_task=(current_task["task_id"] if current_task else ""),
                clean_tail=excerpt(clean_tail),
                clean_lines=excerpt(clean_lines),
            )
            if args.protocol_worker:
                if current_task and not current_task["acked"]:
                    emit_marker(f"HALT {current_task['task_id']} PROCESS_EXIT_BEFORE_ACK")
                elif current_task:
                    emit_marker(f"HALT {current_task['task_id']} PROCESS_EXIT_DURING_TASK")
                else:
                    emit_marker("HALT WRAPPER PROCESS_EXIT")
            else:
                if not packet_acked:
                    emit_marker("MC_STATE PROCESS_EXIT_BEFORE_ACK")
                elif not worker_running:
                    emit_marker("MC_STATE PROCESS_EXIT_AFTER_ACK")
            break

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
