#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
PACKET_FILE="$TMP_DIR/packet.txt"
OUTPUT_FILE="$TMP_DIR/output.log"
FAKE_AGENT="$TMP_DIR/fake-codex.py"

cleanup_test() {
  rm -rf "$TMP_DIR"
}

trap cleanup_test EXIT

cat > "$PACKET_FILE" <<'EOF'
PING_PACKET
EOF

cat > "$FAKE_AGENT" <<'PY'
#!/usr/bin/env python3
import sys
import time

sys.stdout.write("\x1b[?2004h")
sys.stdout.flush()
time.sleep(0.05)
sys.stdout.write("╭─────────────────────────────────────────────╮\r\n")
sys.stdout.write("│ >_ OpenAI Codex (v0.116.0)                  │\r\n")
sys.stdout.write("╰─────────────────────────────────────────────╯\r\n")
sys.stdout.write("  Tip: New Use /fast to enable our fastest inference at 2X plan usage.\r\n")
sys.stdout.write("\r\n")
sys.stdout.write("› Write tests for @filename\r\n")
sys.stdout.write("  gpt-5.4 xhigh · 100% left · ~/tmp/project\r\n")
sys.stdout.flush()

line = sys.stdin.readline().strip()
sys.stdout.write(f"ACK {line}\r\n")
sys.stdout.flush()
time.sleep(0.05)
PY
chmod +x "$FAKE_AGENT"

python3 "$ROOT/.claude/skills/bmad-master-control/agent-wrapper.py" \
  --agent-command "python3 $FAKE_AGENT" \
  --packet-file "$PACKET_FILE" \
  --ready-timeout 5 > "$OUTPUT_FILE"

grep -q 'MC_STATE AGENT_READY' "$OUTPUT_FILE" || {
  echo "expected MC_STATE AGENT_READY" >&2
  exit 1
}

grep -q 'MC_STATE PACKET_SUBMITTED' "$OUTPUT_FILE" || {
  echo "expected MC_STATE PACKET_SUBMITTED" >&2
  exit 1
}

grep -q 'MC_STATE PACKET_ACKED' "$OUTPUT_FILE" || {
  echo "expected MC_STATE PACKET_ACKED" >&2
  exit 1
}

grep -q 'ACK PING_PACKET' "$OUTPUT_FILE" || {
  echo "expected fake codex to receive injected packet" >&2
  exit 1
}

echo "agent-wrapper codex no-alt ready detection: PASS"
