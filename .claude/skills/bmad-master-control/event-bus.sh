#!/usr/bin/env bash
# event-bus.sh — append-only event log with peek/ack consumption, materialization, and generation fencing
# v2 master-control foundation: all state changes are events; gate-state is a materialized view.
#
# Usage:
#   event-bus.sh append <project_root> <expected_gen> <type> <source> <trigger_seq|null> <payload_json>
#   event-bus.sh peek <project_root> <expected_gen> --consumer <name> [--types T1,T2] [--limit N]
#   event-bus.sh ack <project_root> --consumer <name> --seq <N>
#   event-bus.sh materialize <project_root>
#   event-bus.sh stats <project_root>
#   event-bus.sh approve-failover <project_root> <old_gen> <new_gen> <gate> <verified_by> <details> [story_id]
#   event-bus.sh init <project_root> [generation]

set -euo pipefail

exec ruby - "$@" <<'RUBY'
require "json"
require "pathname"
require "set"
require "yaml"
require "time"
require "fileutils"

# ─── Constants ───────────────────────────────────────────────────────────────

EVENT_TYPES = Set.new(%w[
  BATCH_SELECTED
  STORY_PHASE_CHANGED
  GATE_PASSED
  TASK_DISPATCHED
  DISPATCH_STATE_CHANGED
  PANE_REGISTERED
  PANE_CLOSED
  GENERATION_BUMPED
  MERGE_STATE_UPDATED
  PANE_SIGNAL_DETECTED
  PANE_IDLE_NO_SENTINEL
  PANE_TIMEOUT
  HUMAN_REQUEST
  HUMAN_INPUT
  CORRECTION
  HEALTH_ALERT
  HEALTH_EXECUTED
  HEALTH_PROACTIVE
  BATCH_QA_STARTED
  BATCH_MERGE_STARTED
  CURSOR_ADVANCED
]).freeze

# Priority mapping for peek --priority sorting (lower = higher priority)
PRIORITY_ORDER = {
  "P0" => 0, # HALT — immediate human attention
  "P1" => 1, # MC_DONE, PANE_EXIT — actionable signals
  "P2" => 2, # errors, idle, timeout — needs evaluation
  "P3" => 3, # informational — no action needed
}.freeze

# ─── Materialization Rules ───────────────────────────────────────────────────
# Each rule: ->(state, event) { ... }
# Events not listed here are audit-only (no state mutation).

MATERIALIZATION_RULES = {
  "BATCH_SELECTED" => ->(state, e) {
    p = e["payload"]
    state["batch_id"] = p["batch_id"]
    state["batch_stories"] = p["stories"]
    state["config"] = p["config"]
    # Store session context for transition-engine dispatch
    state["session_name"] = p["session_name"] if p["session_name"]
    state["commander_pane"] = p["commander_pane"] if p["commander_pane"]
    state["bottom_anchor"] = p["bottom_anchor"] if p["bottom_anchor"]
    state["panes"] ||= {}
    state["panes"]["inspector"] = p["inspector_pane"] if p["inspector_pane"]
    state["panes"]["utility"] = p["utility_pane"] if p["utility_pane"]
    state["panes"]["bottom_anchor"] = p["bottom_anchor"] if p["bottom_anchor"]
    Array(p["stories"]).each_with_index do |sid, idx|
      state["story_states"][sid] ||= default_story_state($materialize_project_root, sid, idx + 1)
    end
  },

  "STORY_PHASE_CHANGED" => ->(state, e) {
    p = e["payload"]
    ss = state["story_states"][p["story_id"]] ||= {}
    ss["phase"] = p["to_phase"] if p.key?("to_phase")
    %w[review_cycle regression_cycle auto_qa_cycle validation_cycle
       current_llm dispatch_state c2_override].each do |field|
      ss[field] = p[field] if p.key?(field)
    end
  },

  "GATE_PASSED" => ->(state, e) {
    p = e["payload"]
    if p["story_id"] && !p["story_id"].to_s.empty?
      target = (state["story_gates"][p["story_id"]] ||= {})
    else
      target = (state["gates"] ||= {})
    end
    target[p["gate"]] = {
      "status" => "PASS",
      "timestamp" => e["timestamp"],
      "verified_by" => p["verified_by"],
    }
  },

  "TASK_DISPATCHED" => ->(state, e) {
    p = e["payload"]
    ss = state["story_states"][p["story_id"]] ||= {}
    ss["current_llm"] = p["llm"]
    ss["dispatch_state"] = p["dispatch_state"] || "pane_opened"
    ss["c2_override"] = p["c2_override"] || false
    ss["current_worker_id"] = p["worker_id"] if p["worker_id"]
    ss["last_task_id"] = p["task_id"] if p["task_id"]
  },

  "DISPATCH_STATE_CHANGED" => ->(state, e) {
    p = e["payload"]
    ss = state["story_states"][p["story_id"]] ||= {}
    ss["dispatch_state"] = p["dispatch_state"] if p["dispatch_state"]
  },

  "PANE_REGISTERED" => ->(state, e) {
    p = e["payload"]
    panes = ((state["panes"] ||= {})["stories"] ||= {})[p["story_id"]] ||= {}
    panes[p["role"]] = p["pane_id"]
  },

  "PANE_CLOSED" => ->(state, e) {
    p = e["payload"]
    stories = state.dig("panes", "stories")
    if stories && stories[p["story_id"]]
      stories[p["story_id"]].delete(p["role"])
      stories.delete(p["story_id"]) if stories[p["story_id"]].empty?
    end
  },

  "GENERATION_BUMPED" => ->(state, e) {
    p = e["payload"]
    state["session_generation"] = p["new_generation"]
    state["failover_epoch"] = p["failover_epoch"]
  },

  "MERGE_STATE_UPDATED" => ->(state, e) {
    p = e["payload"]
    ms = state["merge_state"] ||= {}
    %w[queue current_story completed].each { |k| ms[k] = p[k] if p.key?(k) }
  },

  # Audit-only events — no state mutation
  "HUMAN_REQUEST"       => ->(_, _) {},
  "HUMAN_INPUT"         => ->(_, _) {},
  "CORRECTION"          => ->(_, _) {},
  "HEALTH_ALERT"        => ->(_, _) {},
  "HEALTH_EXECUTED"     => ->(_, _) {},
  "HEALTH_PROACTIVE"    => ->(_, _) {},
  "BATCH_QA_STARTED"    => ->(_, _) {},
  "BATCH_MERGE_STARTED" => ->(_, _) {},
  "CURSOR_ADVANCED"     => ->(_, _) {},
  "PANE_SIGNAL_DETECTED"  => ->(_, _) {},
  "PANE_IDLE_NO_SENTINEL" => ->(_, _) {},
  "PANE_TIMEOUT"          => ->(_, _) {},
}.freeze

# ─── Helpers ─────────────────────────────────────────────────────────────────

def die(msg, code = 1)
  warn "event-bus.sh: #{msg}"
  exit code
end

def now_z
  Time.now.utc.strftime("%Y-%m-%dT%H:%M:%S.000Z")
end

def artifacts_dir(project_root)
  Pathname(project_root) + "_bmad-output" + "implementation-artifacts"
end

def sprint_status_path(project_root)
  artifacts_dir(project_root) + "sprint-status.yaml"
end

def event_log_path(project_root)
  artifacts_dir(project_root) + "event-log.yaml"
end

def cursors_path(project_root)
  artifacts_dir(project_root) + "consumer-cursors.yaml"
end

def gate_state_path(project_root)
  artifacts_dir(project_root) + "gate-state.yaml"
end

def diag_log_path(project_root)
  artifacts_dir(project_root) + "master-control-diagnostics.log"
end

def runtime_root_path(project_root)
  artifacts_dir(project_root) + "runtime"
end

def watchdog_pid_path(project_root)
  artifacts_dir(project_root) + "watchdog.pid"
end

def watchdog_heartbeat_path(project_root)
  artifacts_dir(project_root) + "watchdog-heartbeat.yaml"
end

def generation_lock_path(project_root)
  artifacts_dir(project_root) + "generation.lock"
end

def lock_file_path(project_root)
  artifacts_dir(project_root) + "event-log.lock"
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

def write_yaml(path, data)
  path.dirname.mkpath
  tmp = Pathname("#{path}.tmp.#{$$}")
  tmp.write(YAML.dump(data))
  FileUtils.mv(tmp.to_s, path.to_s)
end

def read_generation_lock(project_root)
  path = generation_lock_path(project_root)
  return 0 unless path.exist?
  Integer(path.read.strip)
rescue StandardError
  0
end

def ensure_generation(project_root, expected_gen)
  actual = read_generation_lock(project_root)
  if actual != expected_gen
    die("STALE_GENERATION: expected #{expected_gen}, actual #{actual}", 2)
  end
  actual
end

def load_event_log(project_root)
  path = event_log_path(project_root)
  data = load_yaml_safe(path, {"schema_version" => 2, "events" => []})
  data["events"] ||= []
  data
end

def load_cursors(project_root)
  load_yaml_safe(cursors_path(project_root), {"commander" => 0, "watchdog" => 0})
end

def next_seq(events)
  return 1 if events.empty?
  events.map { |e| Integer(e["seq"] || 0) rescue 0 }.max + 1
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
    "story_file_rel" => story_file_rel,
    "story_key" => story_key,
    "validation_cycle" => 0,
    "auto_qa_cycle" => 0,
    "regression_cycle" => 0,
    "merge_priority" => merge_priority,
    "c2_override" => false,
  }
end

def process_alive?(pid)
  Process.kill(0, Integer(pid))
  true
rescue StandardError
  false
end

def materialized_watchdog_state(project_root, fallback = {})
  pid = 0
  heartbeat = {}

  pid_path = watchdog_pid_path(project_root)
  heartbeat_path = watchdog_heartbeat_path(project_root)

  pid = Integer(pid_path.read.strip) if pid_path.exist?
  heartbeat = load_yaml_safe(heartbeat_path, {})

  status =
    if pid <= 0
      fallback.is_a?(Hash) && !fallback.empty? ? fallback["status"] : "unknown"
    elsif !heartbeat_path.exist?
      "missing-heartbeat"
    elsif process_alive?(pid)
      "alive"
    else
      "dead"
    end

  {
    "pid" => pid,
    "last_heartbeat" => heartbeat["last_check"] || (fallback.is_a?(Hash) ? fallback["last_heartbeat"] : nil),
    "status" => status,
  }.compact
rescue ArgumentError
  fallback.is_a?(Hash) ? fallback : {}
end

def build_materialized_state(project_root, events)
  existing_state = load_yaml_safe(gate_state_path(project_root), {})
  $materialize_project_root = project_root

  state = {
    "last_updated" => now_z,
    "batch_id" => nil,
    "batch_stories" => [],
    "config" => {},
    "gates" => {},
    "story_gates" => {},
    "story_states" => {},
    "merge_state" => {"queue" => [], "current_story" => nil, "completed" => []},
    "panes" => {"stories" => {}},
    "session_generation" => read_generation_lock(project_root),
    "failover_epoch" => 0,
    "watchdog" => materialized_watchdog_state(project_root, existing_state["watchdog"]),
    "inspector_state" => existing_state["inspector_state"] || "idle",
  }

  sorted = events.sort_by { |e| Integer(e["seq"]) }
  sorted.each do |event|
    rule = MATERIALIZATION_RULES[event["type"]]
    if rule
      rule.call(state, event)
    else
      warn "event-bus.sh: unknown event type for materialization: #{event["type"]}"
    end
  end

  existing_panes = existing_state["panes"]
  if existing_panes.is_a?(Hash)
    state["panes"]["utility"] = existing_panes["utility"] if existing_panes["utility"]
    state["panes"]["inspector"] = existing_panes["inspector"] if existing_panes["inspector"]
  end
  current_bottom_anchor = state.dig("panes", "bottom_anchor")
  state["bottom_anchor"] = current_bottom_anchor if current_bottom_anchor
  state["last_updated"] = now_z
  state
ensure
  $materialize_project_root = nil
end

# Find event matching criteria in event list
def find_event(events, criteria)
  events.find do |e|
    criteria.all? do |k, v|
      if k == "trigger_seq"
        e[k].to_s == v.to_s
      elsif k.include?(".")
        # Support dotted paths like "payload.story_id"
        parts = k.split(".")
        val = e
        parts.each { |p| val = val.is_a?(Hash) ? val[p] : nil }
        val.to_s == v.to_s
      else
        e[k].to_s == v.to_s
      end
    end
  end
end

# ─── flock wrapper for append safety ────────────────────────────────────────

def with_event_lock(project_root, &block)
  lock_path = lock_file_path(project_root)
  lock_path.dirname.mkpath
  File.open(lock_path.to_s, File::RDWR | File::CREAT) do |lock|
    lock.flock(File::LOCK_EX)
    result = block.call
    lock.flock(File::LOCK_UN)
    result
  end
end

# ─── Subcommands ─────────────────────────────────────────────────────────────

def cmd_append(project_root, expected_gen, type, source, trigger_seq_raw, payload_json)
  die("invalid event type: #{type}") unless EVENT_TYPES.include?(type)

  payload = begin
    JSON.parse(payload_json)
  rescue StandardError => e
    die("invalid payload JSON: #{e.message}")
  end

  with_event_lock(project_root) do
    ensure_generation(project_root, expected_gen)

    log = load_event_log(project_root)
    events = log["events"]
    seq = next_seq(events)

    trigger_seq = trigger_seq_raw == "null" || trigger_seq_raw.nil? ? nil : Integer(trigger_seq_raw)
    priority = payload.delete("_priority") || "P3"

    event = {
      "seq" => seq,
      "type" => type,
      "timestamp" => now_z,
      "generation" => expected_gen,
      "source" => source,
      "trigger_seq" => trigger_seq,
      "priority" => priority,
      "payload" => payload,
    }

    events << event
    write_yaml(event_log_path(project_root), log)
    write_yaml(gate_state_path(project_root), build_materialized_state(project_root, events))

    puts JSON.generate({"success" => true, "seq" => seq, "type" => type})
  end
end

def cmd_peek(project_root, expected_gen, opts)
  ensure_generation(project_root, expected_gen)

  consumer = opts[:consumer] || die("--consumer required for peek")
  types_filter = opts[:types]
  limit = opts[:limit]
  priority_sort = opts[:priority]

  log = load_event_log(project_root)
  cursors = load_cursors(project_root)
  cursor = Integer(cursors[consumer] || 0)

  # Self-healing: if cursor is beyond max_seq, reset to 0
  max_seq = log["events"].map { |e| Integer(e["seq"] || 0) rescue 0 }.max || 0
  if cursor > max_seq && cursor > 0
    warn "event-bus.sh: CURSOR_SELF_HEAL: consumer '#{consumer}' cursor #{cursor} > max_seq #{max_seq}, resetting to 0"
    cursor = 0
    cursors[consumer] = 0
    write_yaml(cursors_path(project_root), cursors)
  end

  events = log["events"].select do |e|
    Integer(e["seq"]) > cursor &&
      Integer(e["generation"] || 0) <= expected_gen
  end

  if types_filter && !types_filter.empty?
    type_set = Set.new(types_filter)
    events = events.select { |e| type_set.include?(e["type"]) }
  end

  if priority_sort
    events.sort_by! { |e| [PRIORITY_ORDER[e["priority"] || "P3"] || 3, Integer(e["seq"])] }
  else
    events.sort_by! { |e| Integer(e["seq"]) }
  end

  events = events.first(limit) if limit && limit > 0

  puts JSON.generate({"success" => true, "events" => events, "cursor" => cursor, "count" => events.length})
end

def cmd_ack(project_root, opts)
  consumer = opts[:consumer] || die("--consumer required for ack")
  seq = opts[:seq] || die("--seq required for ack")
  seq = Integer(seq)

  cursors = load_cursors(project_root)
  current = Integer(cursors[consumer] || 0)

  if seq < current
    die("cannot move cursor backward: current=#{current}, requested=#{seq}")
  end

  cursors[consumer] = seq
  write_yaml(cursors_path(project_root), cursors)

  puts JSON.generate({"success" => true, "consumer" => consumer, "new_cursor" => seq})
end

def cmd_materialize(project_root)
  log = load_event_log(project_root)
  events = log["events"]
  state = build_materialized_state(project_root, events)
  sorted = events.sort_by { |e| Integer(e["seq"]) }
  write_yaml(gate_state_path(project_root), state)

  puts JSON.generate({
    "success" => true,
    "events_replayed" => sorted.length,
    "stories" => state["story_states"].keys,
    "generation" => state["session_generation"],
  })
end

def cmd_stats(project_root)
  log = load_event_log(project_root)
  events = log["events"]

  by_type = events.group_by { |e| e["type"] }.transform_values(&:length)
  last_event = events.max_by { |e| Integer(e["seq"]) }

  puts JSON.generate({
    "success" => true,
    "total" => events.length,
    "last_seq" => last_event ? last_event["seq"] : 0,
    "last_timestamp" => last_event ? last_event["timestamp"] : nil,
    "by_type" => by_type,
  })
end

def cmd_approve_failover(project_root, old_gen, new_gen, gate, verified_by, details, story_id = nil)
  old_gen = Integer(old_gen)
  new_gen = Integer(new_gen)

  # Step 1: Write generation.lock FIRST (atomic barrier)
  # After this, old commander is immediately isolated
  gen_path = generation_lock_path(project_root)
  gen_path.dirname.mkpath
  tmp = Pathname("#{gen_path}.tmp.#{$$}")
  tmp.write(new_gen.to_s)
  FileUtils.mv(tmp.to_s, gen_path.to_s)

  failover_epoch = 0

  with_event_lock(project_root) do
    log = load_event_log(project_root)
    events = log["events"]

    # Compute failover_epoch from existing GENERATION_BUMPED events
    failover_epoch = events.count { |e| e["type"] == "GENERATION_BUMPED" } + 1

    # Step 2: Write GENERATION_BUMPED event
    seq = next_seq(events)
    events << {
      "seq" => seq,
      "type" => "GENERATION_BUMPED",
      "timestamp" => now_z,
      "generation" => new_gen,
      "source" => "inspector",
      "trigger_seq" => nil,
      "priority" => "P0",
      "payload" => {
        "old_generation" => old_gen,
        "new_generation" => new_gen,
        "failover_epoch" => failover_epoch,
        "trigger" => "approve_failover",
      },
    }

    # Step 2b: Write GATE_PASSED event if gate specified
    if gate && !gate.empty?
      seq2 = seq + 1
      gate_payload = {
        "gate" => gate,
        "verified_by" => verified_by,
        "details" => details,
      }
      gate_payload["story_id"] = story_id if story_id && !story_id.to_s.empty?

      events << {
        "seq" => seq2,
        "type" => "GATE_PASSED",
        "timestamp" => now_z,
        "generation" => new_gen,
        "source" => "inspector",
        "trigger_seq" => nil,
        "priority" => "P1",
        "payload" => gate_payload,
      }
    end

    write_yaml(event_log_path(project_root), log)
  end

  # Step 3: Materialize gate-state from event-log
  cmd_materialize(project_root)

  # Override materialize output with failover-specific response
  # (materialize already printed its output, so we append ours to stderr for scripting)
  warn JSON.generate({
    "approve_failover" => true,
    "old_generation" => old_gen,
    "new_generation" => new_gen,
    "failover_epoch" => failover_epoch,
  })
end

def cmd_init(project_root, generation = 0, force: false)
  dir = artifacts_dir(project_root)
  dir.mkpath

  if force
    FileUtils.rm_f(gate_state_path(project_root))
    FileUtils.rm_f(diag_log_path(project_root))
    FileUtils.rm_rf(runtime_root_path(project_root))
  end

  # Initialize generation.lock
  gen_path = generation_lock_path(project_root)
  if force || !gen_path.exist?
    gen_path.write(generation.to_s)
  end

  # Initialize event-log.yaml
  el_path = event_log_path(project_root)
  if force || !el_path.exist?
    write_yaml(el_path, {"schema_version" => 2, "events" => []})
  end

  # Initialize consumer-cursors.yaml — force wipes ALL cursors (including dynamic names)
  cur_path = cursors_path(project_root)
  if force || !cur_path.exist?
    write_yaml(cur_path, {"commander" => 0, "watchdog" => 0, "task_monitor" => 0})
  end

  puts JSON.generate({"success" => true, "initialized" => true, "generation" => generation, "force" => force})
end

# ─── Argument Parsing ────────────────────────────────────────────────────────

def parse_peek_opts(args)
  opts = {}
  i = 0
  while i < args.length
    case args[i]
    when "--consumer"
      opts[:consumer] = args[i + 1]
      i += 2
    when "--types"
      opts[:types] = args[i + 1].split(",").map(&:strip)
      i += 2
    when "--limit"
      opts[:limit] = Integer(args[i + 1])
      i += 2
    when "--priority"
      opts[:priority] = true
      i += 1
    else
      i += 1
    end
  end
  opts
end

def parse_ack_opts(args)
  opts = {}
  i = 0
  while i < args.length
    case args[i]
    when "--consumer"
      opts[:consumer] = args[i + 1]
      i += 2
    when "--seq"
      opts[:seq] = args[i + 1]
      i += 2
    else
      i += 1
    end
  end
  opts
end

# ─── Command Dispatch ────────────────────────────────────────────────────────

cmd = ARGV.shift or die("missing command")

case cmd
when "append"
  die("usage: append <project_root> <expected_gen> <type> <source> <trigger_seq|null> <payload_json>") unless ARGV.length == 6
  cmd_append(ARGV[0], Integer(ARGV[1]), ARGV[2], ARGV[3], ARGV[4], ARGV[5])

when "peek"
  die("usage: peek <project_root> <expected_gen> --consumer <name> [--types T1,T2] [--limit N] [--priority]") unless ARGV.length >= 4
  cmd_peek(ARGV[0], Integer(ARGV[1]), parse_peek_opts(ARGV[2..]))

when "ack"
  die("usage: ack <project_root> --consumer <name> --seq <N>") unless ARGV.length >= 5
  cmd_ack(ARGV[0], parse_ack_opts(ARGV[1..]))

when "materialize"
  die("usage: materialize <project_root>") unless ARGV.length == 1
  cmd_materialize(ARGV[0])

when "stats"
  die("usage: stats <project_root>") unless ARGV.length == 1
  cmd_stats(ARGV[0])

when "approve-failover"
  die("usage: approve-failover <project_root> <old_gen> <new_gen> <gate> <verified_by> <details> [story_id]") unless [6, 7].include?(ARGV.length)
  cmd_approve_failover(ARGV[0], ARGV[1], ARGV[2], ARGV[3], ARGV[4], ARGV[5], ARGV[6])

when "init"
  die("usage: init <project_root> [generation] [--force]") unless (1..3).cover?(ARGV.length)
  force = ARGV.include?("--force")
  init_args = ARGV.reject { |a| a == "--force" }
  cmd_init(init_args[0], Integer(init_args[1] || 0), force: force)

else
  die("unknown command: #{cmd}. Valid: append, peek, ack, materialize, stats, approve-failover, init")
end
RUBY
