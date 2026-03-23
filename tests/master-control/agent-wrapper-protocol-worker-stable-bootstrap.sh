#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
ARTIFACTS_DIR="$TMP_DIR/implementation-artifacts"
WORKER_DIR="$ARTIFACTS_DIR/runtime/0-g0/workers/3-2-create"
PACKET_FILE="$WORKER_DIR/bootstrap.txt"
BOOT_TOKEN_FILE="$WORKER_DIR/worker-boot.token"
OUTPUT_FILE="$TMP_DIR/output.log"
DIAG_FILE="$ARTIFACTS_DIR/master-control-diagnostics.log"
FAKE_AGENT="$TMP_DIR/fake-claude-worker.py"

cleanup_test() {
  rm -rf "$TMP_DIR"
}

trap cleanup_test EXIT

mkdir -p "$WORKER_DIR"

cat > "$PACKET_FILE" <<'EOF'
You are entering BidWise master-control worker protocol mode.
Worker id: 3-2:create
Stay resident in this terminal until explicitly interrupted.
When you are ready to accept tasks, print exactly one line formed by "MC" followed immediately by "_WORKER_READY 3-2:create".
EOF

cat > "$FAKE_AGENT" <<'PY'
#!/usr/bin/env python3
import os
import select
import sys
import termios
import time


def emit(line: str = "") -> None:
    sys.stdout.write(line + "\r\n")
    sys.stdout.flush()


emit("╭─────────────────────────────────────────────╮")
emit("│ Claude Code worker test                     │")
emit("╰─────────────────────────────────────────────╯")
emit("❯ ")
time.sleep(0.2)
emit("Starting MCP servers (1/3)")
time.sleep(0.2)
emit("Starting MCP servers (2/3)")
time.sleep(0.2)
termios.tcflush(sys.stdin.fileno(), termios.TCIFLUSH)

buffer = ""
deadline = time.time() + 5
while time.time() < deadline:
    rlist, _, _ = select.select([sys.stdin], [], [], 0.2)
    if sys.stdin not in rlist:
        continue
    chunk = os.read(sys.stdin.fileno(), 4096)
    if not chunk:
        break
    text = chunk.decode("utf-8", errors="ignore")
    text = text.replace("\x1b[200~", "").replace("\x1b[201~", "")
    buffer += text
    if "BidWise master-control worker protocol mode." in buffer and "3-2:create" in buffer:
        emit("MC_WORKER_READY 3-2:create")
        time.sleep(0.05)
        break
PY
chmod +x "$FAKE_AGENT"

python3 "$ROOT/.claude/skills/bmad-master-control/agent-wrapper.py" \
  --agent-command "python3 $FAKE_AGENT" \
  --packet-file "$PACKET_FILE" \
  --boot-token-file "$BOOT_TOKEN_FILE" \
  --protocol-worker \
  --worker-id "3-2:create" \
  --ready-timeout 5 \
  --bootstrap-timeout 2 \
  --bootstrap-retries 2 \
  --long-lived > "$OUTPUT_FILE"

grep -q 'MC_STATE WORKER_READY' "$OUTPUT_FILE" || {
  echo "expected MC_STATE WORKER_READY" >&2
  exit 1
}

grep -q 'bootstrap.submitted' "$DIAG_FILE" || {
  echo "expected bootstrap.submitted in diagnostics" >&2
  exit 1
}

grep -q 'worker.ready' "$DIAG_FILE" || {
  echo "expected worker.ready in diagnostics" >&2
  exit 1
}

grep -q 'status=worker_ready' "$BOOT_TOKEN_FILE" || {
  echo "expected worker boot token to reach worker_ready" >&2
  exit 1
}

echo "agent-wrapper protocol worker stable bootstrap: PASS"
