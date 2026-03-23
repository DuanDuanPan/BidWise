#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP_DIR="$(mktemp -d)"
PROJECT_ROOT="$TMP_DIR/project"
ARTIFACTS="$PROJECT_ROOT/_bmad-output/implementation-artifacts"

cleanup_test() {
  rm -rf "$TMP_DIR"
}

trap cleanup_test EXIT

mkdir -p "$ARTIFACTS/runtime/session-a-g0"
cat > "$ARTIFACTS/gate-state.yaml" <<'EOF'
bottom_anchor: "%99"
panes:
  bottom_anchor: "%99"
EOF
echo "stale-runtime" > "$ARTIFACTS/runtime/session-a-g0/stale.txt"

bash "$ROOT/.claude/skills/bmad-master-control/event-bus.sh" init "$PROJECT_ROOT" 0 --force >/dev/null

[[ ! -e "$ARTIFACTS/gate-state.yaml" ]] || {
  echo "gate-state.yaml should be removed by init --force" >&2
  exit 1
}

[[ ! -d "$ARTIFACTS/runtime" ]] || {
  echo "runtime directory should be removed by init --force" >&2
  exit 1
}

ruby -ryaml -e '
  log = YAML.load_file(ARGV[0])
  abort("event-log not reset") unless log == {"schema_version" => 2, "events" => []}
' "$ARTIFACTS/event-log.yaml"

echo "event-bus force init cleans stale state: PASS"
