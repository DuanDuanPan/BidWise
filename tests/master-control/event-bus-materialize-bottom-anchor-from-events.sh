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

mkdir -p "$ARTIFACTS"
bash "$ROOT/.claude/skills/bmad-master-control/event-bus.sh" init "$PROJECT_ROOT" 0 >/dev/null

cat > "$ARTIFACTS/gate-state.yaml" <<'EOF'
bottom_anchor: "%99"
panes:
  bottom_anchor: "%99"
EOF

BATCH_PAYLOAD="$(ruby -rjson -e 'puts JSON.generate({
  batch_id: "batch-test",
  stories: ["2-6"],
  config: {
    max_review_cycles: 3,
    max_regression_cycles: 3,
    max_validation_cycles: 3
  },
  session_name: "0",
  commander_pane: "%0",
  inspector_pane: "%2",
  utility_pane: "%3",
  bottom_anchor: "%1"
})')"

bash "$ROOT/.claude/skills/bmad-master-control/event-bus.sh" append \
  "$PROJECT_ROOT" 0 BATCH_SELECTED commander null "$BATCH_PAYLOAD" >/dev/null
bash "$ROOT/.claude/skills/bmad-master-control/event-bus.sh" materialize "$PROJECT_ROOT" >/dev/null

ruby -ryaml -e '
  state = YAML.load_file(ARGV[0])
  anchor = state["bottom_anchor"].to_s
  panes_anchor = state.dig("panes", "bottom_anchor").to_s
  abort("expected event bottom_anchor %1, got #{anchor}") unless anchor == "%1"
  abort("expected panes.bottom_anchor %1, got #{panes_anchor}") unless panes_anchor == "%1"
' "$ARTIFACTS/gate-state.yaml"

echo "event-bus materialize keeps event bottom anchor: PASS"
