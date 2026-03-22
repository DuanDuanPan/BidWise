#!/usr/bin/env bash
# state-control.sh - generation-guarded writes for master-control state files
# Usage:
#   state-control.sh get-generation <project_root>
#   state-control.sh init-batch-state <project_root> <batch_id> <batch_stories_csv> <utility_pane> <inspector_pane> <bottom_anchor> <g1_details> [session_generation]
#   state-control.sh record-batch-gate <project_root> <expected_generation> <gate_name> <verified_by> <details>
#   state-control.sh record-story-gate <project_root> <expected_generation> <story_id> <gate_name> <verified_by> <details>
#   state-control.sh append-dispatch-audit <project_root> <expected_generation> <story_id> <phase> <llm> <auth> <pane> <pane_reuse_reason> <constitution_check> <constitution_detail>
#   state-control.sh append-correction <project_root> <expected_generation> <trigger> <description> <violated_rule> <correct_action> <step> [story_id]
#   state-control.sh register-worker-pane <project_root> <expected_generation> <story_id> <pane_id> <pane_title>
#   state-control.sh upsert-story-state <project_root> <expected_generation> <story_id> <key=value> [<key=value> ...]
#   state-control.sh mark-dispatch-state <project_root> <expected_generation> <story_id> <dispatch_state>
#   state-control.sh set-inspector-state <project_root> <expected_generation> <inspector_state>
#   state-control.sh sync-runtime-panes <project_root> <expected_generation> <utility_pane> <inspector_pane> <bottom_anchor>
#   state-control.sh sync-watchdog <project_root> <expected_generation> <pid> <last_heartbeat> <status>
#   state-control.sh sync-watchdog-from-files <project_root> <expected_generation>
#   state-control.sh cleanup-stale-panes <project_root> <expected_generation> [session_name]
#   state-control.sh update-merge-state <project_root> <expected_generation> <key=value> [<key=value> ...]
#   state-control.sh approve-failover <project_root> <expected_generation> <gate_name> <verified_by> <details> [story_id]

set -euo pipefail

exec ruby - "$@" <<'RUBY'
require "json"
require "open3"
require "pathname"
require "yaml"
require "time"

INTEGER_STORY_FIELDS = %w[review_cycle validation_cycle auto_qa_cycle merge_priority].freeze
BOOLEAN_STORY_FIELDS = %w[is_ui].freeze
ASSIGNABLE_STORY_FIELDS = %w[
  phase
  review_cycle
  current_llm
  dispatch_state
  is_ui
  worktree_path
  story_file_main
  story_file_rel
  story_key
  validation_cycle
  auto_qa_cycle
  merge_priority
].freeze
INSPECTOR_STATES = %w[idle busy_gate busy_audit busy_behavior].freeze
MERGE_STATE_FIELDS = %w[queue current_story completed].freeze

def sprint_status_path(project_root)
  artifacts_dir(project_root) + "sprint-status.yaml"
end

def load_yaml_safe(path, default = {})
  return default unless path.exist?
  loaded = YAML.load_file(path)
  loaded.is_a?(Hash) ? loaded : default
rescue StandardError
  default
end

def load_sprint_status(project_root)
  load_yaml_safe(sprint_status_path(project_root), {})
end

def resolve_story_key(project_root, story_id)
  development_status = load_sprint_status(project_root)["development_status"]
  return story_id if development_status.is_a?(Hash) && development_status.key?(story_id)
  return nil unless development_status.is_a?(Hash)

  matched_key = development_status.keys.find do |key|
    key_str = key.to_s
    key_str == story_id || key_str.start_with?("#{story_id}-")
  end
  matched_key&.to_s
end

def resolve_story_file_rel(project_root, story_id, story_key = nil)
  impl_dir = artifacts_dir(project_root)
  legacy_rel = "_bmad-output/implementation-artifacts/story-#{story_id}.md"
  story_key = story_key.to_s.strip
  keyed_rel = story_key.empty? ? nil : "_bmad-output/implementation-artifacts/#{story_key}.md"

  existing = [keyed_rel, legacy_rel].compact.find do |rel|
    (Pathname(project_root) + rel).exist?
  end
  return existing if existing

  glob_match = Dir.glob((impl_dir + "*#{story_id}*.md").to_s)
    .reject { |path| File.basename(path).include?("validation") }
    .sort
    .first
  return Pathname(glob_match).relative_path_from(Pathname(project_root)).to_s if glob_match

  keyed_rel || legacy_rel
end

def default_story_state(project_root, story_id, merge_priority = nil)
  story_key = resolve_story_key(project_root, story_id)
  story_file_rel = resolve_story_file_rel(project_root, story_id, story_key)
  {
    "phase" => nil,
    "review_cycle" => 0,
    "current_llm" => "claude",
    "dispatch_state" => nil,
    "is_ui" => nil,
    "worktree_path" => "../BidWise-story-#{story_id}",
    "story_file_main" => (Pathname(project_root) + story_file_rel).to_s,
    "story_file_rel" => story_file_rel,
    "story_key" => story_key,
    "validation_cycle" => 0,
    "auto_qa_cycle" => 0,
    "merge_priority" => merge_priority,
  }
end

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

def heartbeat_path(project_root)
  artifacts_dir(project_root) + "watchdog-heartbeat.yaml"
end

def watchdog_pid_path(project_root)
  artifacts_dir(project_root) + "watchdog.pid"
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

def story_merge_priority(state, story_id)
  batch_stories = Array(state["batch_stories"])
  idx = batch_stories.index(story_id)
  idx ? idx + 1 : nil
end

def normalize_story_state(project_root, state, story_id, story_state)
  normalized = default_story_state(project_root, story_id, story_merge_priority(state, story_id)).merge(story_state || {})
  resolved_story_key = resolve_story_key(project_root, story_id)
  resolved_story_file_rel = resolve_story_file_rel(project_root, story_id, resolved_story_key)
  current_story_file_rel = normalized["story_file_rel"].to_s
  current_story_file_path = current_story_file_rel.empty? ? nil : (Pathname(project_root) + current_story_file_rel)
  resolved_story_file_path = Pathname(project_root) + resolved_story_file_rel

  if normalized["story_key"].to_s.empty? && resolved_story_key
    normalized["story_key"] = resolved_story_key
  end

  if current_story_file_rel.empty? || (!current_story_file_path.exist? && resolved_story_file_path.exist?)
    normalized["story_file_rel"] = resolved_story_file_rel
  end

  normalized["story_file_main"] = (Pathname(project_root) + normalized["story_file_rel"].to_s).to_s
  normalized.delete("dev_pane")
  normalized.delete("pane_title")
  normalized
end

def parse_nullable(raw_value)
  return nil if raw_value.nil?

  lowered = raw_value.strip.downcase
  return nil if %w[nil null ~].include?(lowered)

  raw_value
end

def coerce_story_field(field, raw_value)
  value = parse_nullable(raw_value)
  return nil if value.nil?

  if INTEGER_STORY_FIELDS.include?(field)
    return Integer(value)
  end

  if BOOLEAN_STORY_FIELDS.include?(field)
    lowered = value.downcase
    return true if lowered == "true"
    return false if lowered == "false"

    die("invalid boolean for #{field}: #{raw_value}")
  end

  value
rescue ArgumentError
  die("invalid integer for #{field}: #{raw_value}")
end

def coerce_list(raw_value)
  value = parse_nullable(raw_value)
  return [] if value.nil?

  value.split(",").map(&:strip).reject(&:empty?)
end

def process_alive?(pid)
  return false if pid.nil? || pid <= 0

  Process.kill(0, pid)
  true
rescue Errno::EPERM
  true
rescue Errno::ESRCH, RangeError
  false
end

def ensure_story_panes(state, story_id)
  state["panes"] ||= {}
  state["panes"]["stories"] ||= {}
  state["panes"]["stories"][story_id] ||= {}
end

def set_story_pane(state, story_id, role, pane_id)
  story_panes = ensure_story_panes(state, story_id)
  if pane_id.nil? || pane_id.to_s.empty?
    story_panes.delete(role)
    state["panes"]["stories"].delete(story_id) if story_panes.empty?
  else
    story_panes[role] = pane_id
  end
end

def live_pane_ids(session_name = nil)
  cmd = ["tmux", "list-panes"]
  if session_name && !session_name.empty?
    cmd += ["-t", session_name]
  else
    cmd << "-s"
  end
  cmd += ["-F", '#{pane_id}']
  output, status = Open3.capture2e(*cmd)
  die("tmux list-panes failed: #{output.strip}") unless status.success?

  output.lines.map(&:strip).reject(&:empty?)
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

def ensure_story_state(state, project_root, story_id)
  state["story_states"] ||= {}
  state["story_states"][story_id] = normalize_story_state(project_root, state, story_id, state["story_states"][story_id])
  state["story_states"][story_id]
end

def init_batch_state(project_root, batch_id, batch_stories_csv, utility_pane, inspector_pane, bottom_anchor, g1_details, session_generation = 0)
  stories = batch_stories_csv.split(",").map(&:strip).reject(&:empty?)
  timestamp = now_z
  story_states = stories.each_with_index.each_with_object({}) do |(story_id, idx), acc|
    acc[story_id] = default_story_state(project_root, story_id, idx + 1)
  end
  story_panes = stories.each_with_object({}) { |story_id, acc| acc[story_id] = {} }
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
    "story_states" => story_states,
    "merge_state" => {"queue" => [], "current_story" => nil, "completed" => []},
    "panes" => {
      "utility" => utility_pane,
      "inspector" => inspector_pane,
      "bottom_anchor" => bottom_anchor,
      "stories" => story_panes,
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

def register_worker_pane(project_root, expected_generation, story_id, pane_id, pane_title)
  state = ensure_generation(project_root, expected_generation)
  state["last_updated"] = now_z
  story_state = ensure_story_state(state, project_root, story_id)
  story_state["phase"] ||= "dev"
  story_state["current_llm"] ||= "claude"
  # Step 3 is only partially complete after pane creation; dispatch_state captures that nuance.
  story_state["dispatch_state"] ||= "pane_opened"
  set_story_pane(state, story_id, "dev", pane_id)
  write_yaml(state_path(project_root), state)
  puts "worker pane #{pane_id} (#{pane_title}) registered for story #{story_id}"
end

def mark_dispatch_state(project_root, expected_generation, story_id, dispatch_state)
  state = ensure_generation(project_root, expected_generation)
  state["last_updated"] = now_z
  story_state = ensure_story_state(state, project_root, story_id)
  story_state["dispatch_state"] = dispatch_state
  write_yaml(state_path(project_root), state)
  puts "dispatch_state=#{dispatch_state} recorded for story #{story_id}"
end

def upsert_story_state(project_root, expected_generation, story_id, assignments)
  die("usage: upsert-story-state <project_root> <expected_generation> <story_id> <key=value> [<key=value> ...]") if assignments.empty?

  state = ensure_generation(project_root, expected_generation)
  state["last_updated"] = now_z
  story_state = ensure_story_state(state, project_root, story_id)

  assignments.each do |assignment|
    key, raw_value = assignment.split("=", 2)
    die("invalid assignment: #{assignment}") if key.nil? || raw_value.nil?

    if key.start_with?("pane.")
      role = key.split(".", 2).last
      die("invalid pane role assignment: #{assignment}") if role.nil? || role.empty?

      set_story_pane(state, story_id, role, parse_nullable(raw_value))
      next
    end

    die("unsupported story field: #{key}") unless ASSIGNABLE_STORY_FIELDS.include?(key)
    story_state[key] = coerce_story_field(key, raw_value)
  end

  write_yaml(state_path(project_root), state)
  puts "story #{story_id} updated"
end

def set_inspector_state(project_root, expected_generation, inspector_state)
  die("invalid inspector_state: #{inspector_state}") unless INSPECTOR_STATES.include?(inspector_state)

  state = ensure_generation(project_root, expected_generation)
  state["last_updated"] = now_z
  state["inspector_state"] = inspector_state
  write_yaml(state_path(project_root), state)
  puts "inspector_state=#{inspector_state}"
end

def sync_runtime_panes(project_root, expected_generation, utility_pane, inspector_pane, bottom_anchor)
  state = ensure_generation(project_root, expected_generation)
  state["last_updated"] = now_z
  state["panes"] ||= {}
  state["panes"]["utility"] = utility_pane
  state["panes"]["inspector"] = inspector_pane
  state["panes"]["bottom_anchor"] = bottom_anchor
  write_yaml(state_path(project_root), state)
  puts "runtime panes synced"
end

def sync_watchdog(project_root, expected_generation, pid, last_heartbeat, status)
  state = ensure_generation(project_root, expected_generation)
  state["last_updated"] = now_z
  state["watchdog"] ||= {}
  state["watchdog"]["pid"] = Integer(pid)
  state["watchdog"]["last_heartbeat"] = last_heartbeat.to_s.empty? ? nil : last_heartbeat
  state["watchdog"]["status"] = status
  write_yaml(state_path(project_root), state)
  puts "watchdog synced"
end

def sync_watchdog_from_files(project_root, expected_generation)
  state = ensure_generation(project_root, expected_generation)
  state["last_updated"] = now_z
  state["watchdog"] ||= {}

  pid_path = watchdog_pid_path(project_root)
  hb_path = heartbeat_path(project_root)
  pid = if pid_path.exist?
    Integer(pid_path.read.strip)
  else
    0
  end
  heartbeat = hb_path.exist? ? load_yaml(hb_path) : {}
  last_heartbeat = heartbeat["last_check"]
  status = if pid <= 0
    "unknown"
  elsif !hb_path.exist?
    "missing-heartbeat"
  elsif process_alive?(pid)
    "alive"
  else
    "dead"
  end

  state["watchdog"]["pid"] = pid
  state["watchdog"]["last_heartbeat"] = last_heartbeat
  state["watchdog"]["status"] = status
  write_yaml(state_path(project_root), state)
  puts "watchdog synced from files"
rescue ArgumentError
  die("invalid watchdog pid file: #{watchdog_pid_path(project_root)}")
end

def cleanup_stale_panes(project_root, expected_generation, session_name = nil)
  state = ensure_generation(project_root, expected_generation)
  live_panes = live_pane_ids(session_name)
  changed = false

  Array(state["story_states"]).each do |story_id, story_state|
    next unless story_state.is_a?(Hash)

    changed ||= !story_state.delete("dev_pane").nil?
    changed ||= !story_state.delete("pane_title").nil?
    state["story_states"][story_id] = normalize_story_state(project_root, state, story_id, story_state)
  end

  panes = state["panes"] ||= {}
  %w[utility inspector bottom_anchor].each do |key|
    next unless panes[key]
    next if live_panes.include?(panes[key])

    panes.delete(key)
    changed = true
  end

  story_panes = panes["stories"] ||= {}
  story_panes.keys.each do |story_id|
    roles = story_panes[story_id]
    unless roles.is_a?(Hash)
      story_panes.delete(story_id)
      changed = true
      next
    end

    roles.keys.each do |role|
      pane_id = roles[role]
      next if pane_id && live_panes.include?(pane_id)

      roles.delete(role)
      changed = true
    end

    if roles.empty?
      story_panes.delete(story_id)
      changed = true
    end
  end

  if changed
    state["last_updated"] = now_z
    write_yaml(state_path(project_root), state)
    puts "stale pane references cleaned"
  else
    puts "no stale pane references found"
  end
end

def update_merge_state(project_root, expected_generation, assignments)
  die("usage: update-merge-state <project_root> <expected_generation> <key=value> [<key=value> ...]") if assignments.empty?

  state = ensure_generation(project_root, expected_generation)
  state["last_updated"] = now_z
  merge_state = state["merge_state"] ||= {"queue" => [], "current_story" => nil, "completed" => []}

  assignments.each do |assignment|
    key, raw_value = assignment.split("=", 2)
    die("invalid assignment: #{assignment}") if key.nil? || raw_value.nil?
    die("unsupported merge_state field: #{key}") unless MERGE_STATE_FIELDS.include?(key)

    merge_state[key] =
      if %w[queue completed].include?(key)
        coerce_list(raw_value)
      else
        parse_nullable(raw_value)
      end
  end

  write_yaml(state_path(project_root), state)
  puts "merge_state updated"
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
when "register-worker-pane"
  die("usage: register-worker-pane <project_root> <expected_generation> <story_id> <pane_id> <pane_title>") unless ARGV.length == 5
  register_worker_pane(ARGV[0], ARGV[1].to_i, ARGV[2], ARGV[3], ARGV[4])
when "upsert-story-state"
  die("usage: upsert-story-state <project_root> <expected_generation> <story_id> <key=value> [<key=value> ...]") unless ARGV.length >= 4
  upsert_story_state(ARGV[0], ARGV[1].to_i, ARGV[2], ARGV[3..])
when "mark-dispatch-state"
  die("usage: mark-dispatch-state <project_root> <expected_generation> <story_id> <dispatch_state>") unless ARGV.length == 4
  mark_dispatch_state(ARGV[0], ARGV[1].to_i, ARGV[2], ARGV[3])
when "set-inspector-state"
  die("usage: set-inspector-state <project_root> <expected_generation> <inspector_state>") unless ARGV.length == 3
  set_inspector_state(ARGV[0], ARGV[1].to_i, ARGV[2])
when "sync-runtime-panes"
  die("usage: sync-runtime-panes <project_root> <expected_generation> <utility_pane> <inspector_pane> <bottom_anchor>") unless ARGV.length == 5
  sync_runtime_panes(ARGV[0], ARGV[1].to_i, ARGV[2], ARGV[3], ARGV[4])
when "sync-watchdog"
  die("usage: sync-watchdog <project_root> <expected_generation> <pid> <last_heartbeat> <status>") unless ARGV.length == 5
  sync_watchdog(ARGV[0], ARGV[1].to_i, ARGV[2], ARGV[3], ARGV[4])
when "sync-watchdog-from-files"
  die("usage: sync-watchdog-from-files <project_root> <expected_generation>") unless ARGV.length == 2
  sync_watchdog_from_files(ARGV[0], ARGV[1].to_i)
when "cleanup-stale-panes"
  die("usage: cleanup-stale-panes <project_root> <expected_generation> [session_name]") unless [2, 3].include?(ARGV.length)
  cleanup_stale_panes(ARGV[0], ARGV[1].to_i, ARGV[2])
when "update-merge-state"
  die("usage: update-merge-state <project_root> <expected_generation> <key=value> [<key=value> ...]") unless ARGV.length >= 3
  update_merge_state(ARGV[0], ARGV[1].to_i, ARGV[2..])
when "approve-failover"
  die("usage: approve-failover <project_root> <expected_generation> <gate_name> <verified_by> <details> [story_id]") unless [5, 6].include?(ARGV.length)
  approve_failover(ARGV[0], ARGV[1].to_i, ARGV[2], ARGV[3], ARGV[4], ARGV[5])
else
  die("unknown command: #{cmd}")
end
RUBY
