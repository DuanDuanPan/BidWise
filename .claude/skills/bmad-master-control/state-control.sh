#!/usr/bin/env bash
# state-control.sh - generation-guarded writes for master-control state files
# Usage:
#   state-control.sh get-generation <project_root>
#   state-control.sh init-batch-state <project_root> <batch_id> <batch_stories_csv> <utility_pane> <inspector_pane> <bottom_anchor> <g1_details> [session_generation]
#   state-control.sh record-batch-gate <project_root> <expected_generation> <gate_name> <verified_by> <details>
#   state-control.sh record-story-gate <project_root> <expected_generation> <story_id> <gate_name> <verified_by> <details>
#   state-control.sh append-dispatch-audit <project_root> <expected_generation> <story_id> <phase> <llm> <auth> <pane> <pane_reuse_reason> <constitution_check> <constitution_detail>
#   state-control.sh append-correction <project_root> <expected_generation> <trigger> <description> <violated_rule> <correct_action> <step> [story_id]
#   state-control.sh approve-failover <project_root> <expected_generation> <gate_name> <verified_by> <details> [story_id]

set -euo pipefail

exec ruby - "$@" <<'RUBY'
require "json"
require "pathname"
require "yaml"
require "time"

def die(msg, code = 1)
  warn "state-control.sh: #{msg}"
  exit code
end

def now_z
  Time.now.utc.strftime("%Y-%m-%dT%H:%M:%S.000Z")
end

def artifacts_dir(project_root)
  Pathname(project_root) + "_bmad-output" + "implementation-artifacts"
end

def state_path(project_root)
  artifacts_dir(project_root) + "gate-state.yaml"
end

def journal_path(project_root)
  artifacts_dir(project_root) + "session-journal.yaml"
end

def load_yaml(path)
  die("missing file: #{path}") unless path.exist?
  loaded = YAML.load_file(path)
  loaded.is_a?(Hash) ? loaded : {}
rescue StandardError => e
  die("failed to load #{path}: #{e.message}")
end

def write_yaml(path, data)
  path.dirname.mkpath
  path.write(YAML.dump(data))
end

def generation_of(state)
  Integer(state["session_generation"] || 0)
rescue StandardError
  0
end

def ensure_generation(project_root, expected_generation)
  state = load_yaml(state_path(project_root))
  actual_generation = generation_of(state)
  die("stale generation: expected #{expected_generation}, actual #{actual_generation}", 2) unless actual_generation == expected_generation
  state
end

def ensure_journal(project_root)
  path = journal_path(project_root)
  return {"batch_id" => "", "entries" => []} unless path.exist?

  loaded = YAML.load_file(path)
  loaded.is_a?(Hash) ? loaded : {"batch_id" => "", "entries" => []}
rescue StandardError => e
  die("failed to load #{path}: #{e.message}")
end

def next_seq(journal)
  entries = journal["entries"] ||= []
  max_seq = entries.map { |entry| Integer(entry["seq"] || 0) rescue 0 }.max || 0
  max_seq + 1
end

def print_generation(project_root)
  state = load_yaml(state_path(project_root))
  puts generation_of(state)
end

def init_batch_state(project_root, batch_id, batch_stories_csv, utility_pane, inspector_pane, bottom_anchor, g1_details, session_generation = 0)
  stories = batch_stories_csv.split(",").map(&:strip).reject(&:empty?)
  timestamp = now_z
  state = {
    "last_updated" => timestamp,
    "batch_id" => batch_id,
    "batch_stories" => stories,
    "session_generation" => session_generation,
    "failover_epoch" => 0,
    "gates" => {
      "G1" => {
        "status" => "PASS",
        "timestamp" => timestamp,
        "verified_by" => "commander",
        "details" => g1_details,
      },
    },
    "story_gates" => {},
    "story_states" => {},
    "merge_state" => {"queue" => [], "current_story" => nil, "completed" => []},
    "panes" => {
      "utility" => utility_pane,
      "inspector" => inspector_pane,
      "bottom_anchor" => bottom_anchor,
    },
    "watchdog" => {
      "pid" => 0,
      "last_heartbeat" => nil,
      "status" => "unknown",
    },
    "inspector_state" => "idle",
  }
  write_yaml(state_path(project_root), state)
  puts "initialized gate-state.yaml"
end

def record_batch_gate(project_root, expected_generation, gate_name, verified_by, details)
  state = ensure_generation(project_root, expected_generation)
  timestamp = now_z
  state["last_updated"] = timestamp
  state["gates"] ||= {}
  state["gates"][gate_name] = {
    "status" => "PASS",
    "timestamp" => timestamp,
    "verified_by" => verified_by,
    "details" => details,
  }
  write_yaml(state_path(project_root), state)
  puts "#{gate_name} recorded for generation #{expected_generation}"
end

def record_story_gate(project_root, expected_generation, story_id, gate_name, verified_by, details)
  state = ensure_generation(project_root, expected_generation)
  timestamp = now_z
  state["last_updated"] = timestamp
  state["story_gates"] ||= {}
  state["story_gates"][story_id] ||= {}
  state["story_gates"][story_id][gate_name] = {
    "status" => "PASS",
    "timestamp" => timestamp,
    "verified_by" => verified_by,
    "details" => details,
  }
  write_yaml(state_path(project_root), state)
  puts "#{gate_name} recorded for story #{story_id} generation #{expected_generation}"
end

def append_dispatch_audit(project_root, expected_generation, story_id, phase, llm, auth, pane, pane_reuse_reason, constitution_check, constitution_detail)
  state = ensure_generation(project_root, expected_generation)
  journal = ensure_journal(project_root)
  seq = next_seq(journal)
  entry = {
    "seq" => seq,
    "timestamp" => Time.now.utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
    "type" => "dispatch_audit",
    "story_id" => story_id,
    "phase" => phase,
    "llm" => llm,
    "auth" => auth,
    "pane" => pane,
    "pane_reuse_reason" => pane_reuse_reason,
    "constitution_check" => constitution_check,
    "constitution_detail" => constitution_detail,
    "session_generation" => generation_of(state),
  }
  journal["entries"] ||= []
  journal["entries"] << entry
  write_yaml(journal_path(project_root), journal)
  puts "journal entry ##{seq} recorded"
end

def append_correction(project_root, expected_generation, trigger, description, violated_rule, correct_action, step, story_id = nil)
  state = ensure_generation(project_root, expected_generation)
  journal = ensure_journal(project_root)
  seq = next_seq(journal)
  entry = {
    "seq" => seq,
    "timestamp" => Time.now.utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
    "type" => "correction",
    "trigger" => trigger,
    "description" => description,
    "violated_rule" => violated_rule,
    "correct_action" => correct_action,
    "step" => step,
    "session_generation" => generation_of(state),
  }
  entry["story_id"] = story_id if story_id && !story_id.empty?
  journal["entries"] ||= []
  journal["entries"] << entry
  write_yaml(journal_path(project_root), journal)
  puts "correction entry ##{seq} recorded"
end

def approve_failover(project_root, expected_generation, gate_name, verified_by, details, story_id = nil)
  state = ensure_generation(project_root, expected_generation)
  old_generation = generation_of(state)
  timestamp = now_z

  state["last_updated"] = timestamp
  state["failover_epoch"] = Integer(state["failover_epoch"] || 0) + 1
  state["session_generation"] = old_generation + 1

  gate_payload = {
    "status" => "PASS",
    "timestamp" => timestamp,
    "verified_by" => verified_by,
    "details" => details,
  }

  if story_id && !story_id.empty?
    state["story_gates"] ||= {}
    state["story_gates"][story_id] ||= {}
    state["story_gates"][story_id][gate_name] = gate_payload
  else
    state["gates"] ||= {}
    state["gates"][gate_name] = gate_payload
  end

  write_yaml(state_path(project_root), state)
  puts JSON.generate(
    {
      "old_generation" => old_generation,
      "new_generation" => old_generation + 1,
      "failover_epoch" => state["failover_epoch"],
    }
  )
end

cmd = ARGV.shift or die("missing command")

case cmd
when "get-generation"
  die("usage: get-generation <project_root>") unless ARGV.length == 1
  print_generation(ARGV[0])
when "init-batch-state"
  die("usage: init-batch-state <project_root> <batch_id> <batch_stories_csv> <utility_pane> <inspector_pane> <bottom_anchor> <g1_details> [session_generation]") unless [7, 8].include?(ARGV.length)
  init_batch_state(ARGV[0], ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5], ARGV[6], (ARGV[7] || 0).to_i)
when "record-batch-gate"
  die("usage: record-batch-gate <project_root> <expected_generation> <gate_name> <verified_by> <details>") unless ARGV.length == 5
  record_batch_gate(ARGV[0], ARGV[1].to_i, ARGV[2], ARGV[3], ARGV[4])
when "record-story-gate"
  die("usage: record-story-gate <project_root> <expected_generation> <story_id> <gate_name> <verified_by> <details>") unless ARGV.length == 6
  record_story_gate(ARGV[0], ARGV[1].to_i, ARGV[2], ARGV[3], ARGV[4], ARGV[5])
when "append-dispatch-audit"
  die("usage: append-dispatch-audit <project_root> <expected_generation> <story_id> <phase> <llm> <auth> <pane> <pane_reuse_reason> <constitution_check> <constitution_detail>") unless ARGV.length == 10
  append_dispatch_audit(*ARGV[0, 10].tap { |args| args[1] = args[1].to_i })
when "append-correction"
  die("usage: append-correction <project_root> <expected_generation> <trigger> <description> <violated_rule> <correct_action> <step> [story_id]") unless [7, 8].include?(ARGV.length)
  append_correction(ARGV[0], ARGV[1].to_i, ARGV[2], ARGV[3], ARGV[4], ARGV[5], ARGV[6], ARGV[7])
when "approve-failover"
  die("usage: approve-failover <project_root> <expected_generation> <gate_name> <verified_by> <details> [story_id]") unless [5, 6].include?(ARGV.length)
  approve_failover(ARGV[0], ARGV[1].to_i, ARGV[2], ARGV[3], ARGV[4], ARGV[5])
else
  die("unknown command: #{cmd}")
end
RUBY
