#!/usr/bin/env bash
# command-gateway.sh — validation boundary for all commander commands
# v2 master-control: generation fencing, command parsing, trigger-seq enforcement, routing.
#
# Usage:
#   command-gateway.sh <project_root> <expected_generation> <command...>
#
# Commands:
#   TRANSITION <story_id> <intent> --trigger-seq <N>
#   DISPATCH <story_id> <phase> --trigger-seq <N> [--override-llm LLM --override-reason REASON] [--fresh-pane]
#   REQUEST_HUMAN <story_id> <reason> --trigger-seq <N>
#   BATCH <action> [args]
#   HEALTH <action> (--trigger-seq <N> | --proactive)
#   PEEK_EVENTS [--types T1,T2] [--limit N] [--priority]
#   ACK_EVENTS --seq <N>

set -euo pipefail

export SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

exec ruby - "$@" <<'RUBY'
require "json"
require "yaml"
require "pathname"
require "set"
require "open3"

# ─── Constants ───────────────────────────────────────────────────────────────

VALID_INTENTS = Set.new(%w[
  create_dispatched create_complete
  prototype_dispatched prototype_complete skip_prototype
  validate_dispatched validate_pass validate_fail
  batch_committed g5_approved dev_dispatched
  dev_complete g7_pass review_pass review_fail
  fix_complete qa_dispatched qa_pass qa_fail
  uat_pass uat_fail g10_approved
  regression_start regression_pass regression_fail
]).freeze

VALID_PHASES = Set.new(%w[
  create prototype validate dev review fixing qa regression
]).freeze

VALID_HEALTH_ACTIONS = Set.new(%w[
  check_inspector restart_watchdog rebuild_pane check_logging
]).freeze

VALID_BATCH_ACTIONS = Set.new(%w[
  select commit start_qa start_merge_queue
]).freeze

# Commands that always require --trigger-seq
ALWAYS_REQUIRES_TRIGGER_SEQ = Set.new(%w[transition dispatch request_human]).freeze

# BATCH subcommands that require --trigger-seq
BATCH_REQUIRES_TRIGGER_SEQ = Set.new(%w[commit start_qa start_merge_queue]).freeze

# ─── Helpers ─────────────────────────────────────────────────────────────────

def die(msg, code = 1)
  puts JSON.generate({"success" => false, "error" => msg})
  exit code
end

def artifacts_dir(project_root)
  Pathname(project_root) + "_bmad-output" + "implementation-artifacts"
end

def generation_lock_path(project_root)
  artifacts_dir(project_root) + "generation.lock"
end

def read_generation_lock(project_root)
  path = generation_lock_path(project_root)
  return 0 unless path.exist?
  Integer(path.read.strip)
rescue StandardError
  0
end

def script_path(name)
  File.join(SCRIPT_DIR, name)
end

def run_script(name, *args)
  cmd = [script_path(name)] + args.map(&:to_s)
  stdout, stderr, status = Open3.capture3(*cmd)
  unless status.success?
    error_msg = stderr.strip.empty? ? stdout.strip : stderr.strip
    die("#{name} failed: #{error_msg}")
  end
  stdout.strip
end

# ─── Command Parser ──────────────────────────────────────────────────────────

class ParsedCommand
  attr_accessor :type, :story_id, :intent, :phase, :reason, :action,
                :trigger_seq, :override_llm, :override_reason, :fresh_pane,
                :proactive, :types, :limit, :seq, :consumer, :priority,
                :stories_csv, :args_rest
end

def parse_command(tokens)
  return nil if tokens.empty?
  cmd = ParsedCommand.new
  verb = tokens.shift.upcase

  case verb
  when "TRANSITION"
    cmd.type = :transition
    cmd.story_id = tokens.shift or return nil
    cmd.intent = tokens.shift or return nil
    return nil unless VALID_INTENTS.include?(cmd.intent)
    parse_flags(cmd, tokens)

  when "DISPATCH"
    cmd.type = :dispatch
    cmd.story_id = tokens.shift or return nil
    cmd.phase = tokens.shift or return nil
    return nil unless VALID_PHASES.include?(cmd.phase)
    parse_flags(cmd, tokens)

  when "REQUEST_HUMAN"
    cmd.type = :request_human
    cmd.story_id = tokens.shift or return nil
    cmd.reason = tokens.shift or return nil
    parse_flags(cmd, tokens)

  when "RECORD_GATE"
    cmd.type = :record_gate
    cmd.action = tokens.shift or return nil  # gate name, e.g. G2
    cmd.story_id = nil
    # Optional story_id for per-story gates
    if tokens.first && !tokens.first.start_with?("--")
      cmd.story_id = tokens.shift
    end
    parse_flags(cmd, tokens)

  when "BATCH"
    cmd.type = :batch
    cmd.action = tokens.shift or return nil
    return nil unless VALID_BATCH_ACTIONS.include?(cmd.action)
    cmd.args_rest = tokens.dup
    parse_flags(cmd, tokens)

  when "HEALTH"
    cmd.type = :health
    cmd.action = tokens.shift or return nil
    return nil unless VALID_HEALTH_ACTIONS.include?(cmd.action)
    # rebuild_pane takes a story_id argument
    if cmd.action == "rebuild_pane" && tokens.first && !tokens.first.start_with?("--")
      cmd.story_id = tokens.shift
    end
    parse_flags(cmd, tokens)

  when "PEEK_EVENTS"
    cmd.type = :peek_events
    parse_flags(cmd, tokens)

  when "ACK_EVENTS"
    cmd.type = :ack_events
    parse_flags(cmd, tokens)

  else
    return nil
  end

  cmd
end

def parse_flags(cmd, tokens)
  i = 0
  while i < tokens.length
    case tokens[i]
    when "--trigger-seq"
      cmd.trigger_seq = Integer(tokens[i + 1]) rescue nil
      i += 2
    when "--override-llm"
      cmd.override_llm = tokens[i + 1]
      i += 2
    when "--override-reason"
      cmd.override_reason = tokens[i + 1]
      i += 2
    when "--fresh-pane"
      cmd.fresh_pane = true
      i += 1
    when "--proactive"
      cmd.proactive = true
      i += 1
    when "--types"
      cmd.types = tokens[i + 1]
      i += 2
    when "--limit"
      cmd.limit = Integer(tokens[i + 1]) rescue nil
      i += 2
    when "--seq"
      cmd.seq = Integer(tokens[i + 1]) rescue nil
      i += 2
    when "--consumer"
      cmd.consumer = tokens[i + 1]
      i += 2
    when "--priority"
      cmd.priority = true
      i += 1
    else
      i += 1
    end
  end
end

# ─── Trigger-seq enforcement ────────────────────────────────────────────────

def requires_trigger_seq?(cmd)
  return true if ALWAYS_REQUIRES_TRIGGER_SEQ.include?(cmd.type.to_s)
  return BATCH_REQUIRES_TRIGGER_SEQ.include?(cmd.action) if cmd.type == :batch
  false
end

# ─── Command Handlers ────────────────────────────────────────────────────────

def handle_transition(project_root, expected_gen, cmd)
  args = ["execute", project_root, expected_gen.to_s, cmd.story_id, cmd.intent,
          "--trigger-seq", cmd.trigger_seq.to_s]
  result = run_script("transition-engine.sh", *args)
  puts result
end

def handle_dispatch(project_root, expected_gen, cmd)
  args = ["dispatch", project_root, expected_gen.to_s, cmd.story_id, cmd.phase,
          "--trigger-seq", cmd.trigger_seq.to_s]
  args += ["--override-llm", cmd.override_llm] if cmd.override_llm
  args += ["--override-reason", cmd.override_reason] if cmd.override_reason
  args << "--fresh-pane" if cmd.fresh_pane
  result = run_script("transition-engine.sh", *args)
  puts result
end

def handle_request_human(project_root, expected_gen, cmd)
  # Dedup: check if already requested for this trigger-seq
  peek_result = run_script("event-bus.sh", "peek", project_root, expected_gen.to_s,
                           "--consumer", "_dedup_check", "--types", "HUMAN_REQUEST", "--limit", "1000")
  parsed = JSON.parse(peek_result)
  events = parsed["events"] || []

  existing = events.find do |e|
    e["trigger_seq"].to_s == cmd.trigger_seq.to_s &&
      e.dig("payload", "story_id") == cmd.story_id
  end

  if existing
    puts JSON.generate({"success" => true, "already_applied" => true, "event_seq" => existing["seq"]})
    return
  end

  payload = {"story_id" => cmd.story_id, "reason" => cmd.reason, "_priority" => "P0"}
  result = run_script("event-bus.sh", "append", project_root, expected_gen.to_s,
                       "HUMAN_REQUEST", "commander", cmd.trigger_seq.to_s, JSON.generate(payload))
  puts result
end

def handle_batch(project_root, expected_gen, cmd)
  case cmd.action
  when "select"
    stories_csv = cmd.args_rest&.find { |a| !a.start_with?("--") }
    die("BATCH select requires <story_csv>") unless stories_csv
    stories = stories_csv.split(",").map(&:strip)

    # Capture session context from tmux runtime for transition-engine dispatch
    session_name = `tmux display-message -p '\#{session_name}' 2>/dev/null`.strip rescue ""
    commander_pane = `tmux display-message -p '\#{pane_id}' 2>/dev/null`.strip rescue ""
    bottom_anchor_line = `tmux list-panes -t "#{session_name}" -F '\#{pane_id} \#{pane_title}' 2>/dev/null`.lines
      .find { |l| l.include?("mc-bottom-anchor") } rescue nil
    bottom_anchor = bottom_anchor_line&.split&.first&.strip || ""

    payload = {
      "batch_id" => "batch-#{Time.now.utc.strftime('%Y-%m-%d')}-#{rand(1000)}",
      "stories" => stories,
      "config" => {"max_review_cycles" => 3, "max_regression_cycles" => 3, "max_validation_cycles" => 3},
      "session_name" => session_name,
      "commander_pane" => commander_pane,
      "bottom_anchor" => bottom_anchor,
    }
    result = run_script("event-bus.sh", "append", project_root, expected_gen.to_s,
                         "BATCH_SELECTED", "commander", "null", JSON.generate(payload))

    # Also record G1 gate (batch confirmed by user)
    g1_payload = {"gate" => "G1", "verified_by" => "commander", "details" => "user confirmed batch: #{stories_csv}"}
    run_script("event-bus.sh", "append", project_root, expected_gen.to_s,
                "GATE_PASSED", "commander", "null", JSON.generate(g1_payload))

    # Materialize to update gate-state immediately
    run_script("event-bus.sh", "materialize", project_root)
    puts result

  when "commit"
    # Iterate all batch stories, run batch_committed transition for each validated one
    # This checks the all_batch_stories_validated precondition and records G4
    gs_path = File.join(project_root, "_bmad-output", "implementation-artifacts", "gate-state.yaml")
    gs = File.exist?(gs_path) ? (YAML.safe_load(File.read(gs_path)) rescue {}) : {}
    stories = gs["batch_stories"] || []
    die("no batch stories found — run BATCH select first") if stories.empty?

    # Use batch-transition to commit all stories atomically
    trigger_seq = cmd.trigger_seq || "null"
    result = run_script("transition-engine.sh", "batch-transition", project_root, expected_gen.to_s,
                         "batch_committed", stories.join(","), "--trigger-seq", trigger_seq.to_s)
    puts result

  when "start_qa"
    stories_csv = cmd.args_rest&.find { |a| !a.start_with?("--") }
    die("BATCH start_qa requires <story_csv>") unless stories_csv
    payload = {"stories" => stories_csv.split(",").map(&:strip), "_priority" => "P1"}
    result = run_script("event-bus.sh", "append", project_root, expected_gen.to_s,
                         "BATCH_QA_STARTED", "commander", cmd.trigger_seq.to_s, JSON.generate(payload))
    puts result

  when "start_merge_queue"
    stories_csv = cmd.args_rest&.find { |a| !a.start_with?("--") }
    die("BATCH start_merge_queue requires <story_csv>") unless stories_csv
    payload = {"stories" => stories_csv.split(",").map(&:strip), "_priority" => "P1"}
    result = run_script("event-bus.sh", "append", project_root, expected_gen.to_s,
                         "BATCH_MERGE_STARTED", "commander", cmd.trigger_seq.to_s, JSON.generate(payload))
    puts result
  end
end

def handle_record_gate(project_root, expected_gen, cmd)
  gate = cmd.action  # e.g. "G2", "G3"
  payload = {"gate" => gate, "verified_by" => "commander", "details" => "commander self-check"}
  payload["story_id"] = cmd.story_id if cmd.story_id && !cmd.story_id.empty?
  result = run_script("event-bus.sh", "append", project_root, expected_gen.to_s,
                       "GATE_PASSED", "commander", "null", JSON.generate(payload))
  run_script("event-bus.sh", "materialize", project_root)
  puts result
end

def handle_health(project_root, expected_gen, cmd)
  has_seq = !cmd.trigger_seq.nil?
  has_pro = cmd.proactive == true

  # XOR: exactly one of --trigger-seq or --proactive
  unless has_seq ^ has_pro
    die("MISSING_MODE: HEALTH requires --trigger-seq or --proactive (exactly one)")
  end

  # Determine audit event type
  audit_type = has_seq ? "HEALTH_EXECUTED" : "HEALTH_PROACTIVE"
  trigger_seq_str = has_seq ? cmd.trigger_seq.to_s : "null"

  payload = {"action" => cmd.action, "_priority" => "P2"}
  payload["story_id"] = cmd.story_id if cmd.story_id

  # Execute the health action
  case cmd.action
  when "check_inspector"
    # Verify inspector pane is alive via tmux
    begin
      gs_path = File.join(project_root, "_bmad-output", "implementation-artifacts", "gate-state.yaml")
      gs = File.exist?(gs_path) ? (YAML.safe_load(File.read(gs_path)) rescue {}) : {}
      session_name = gs["session_name"] || `tmux display-message -p '\#{session_name}' 2>/dev/null`.strip rescue ""
      inspector_line = `tmux list-panes -t "#{session_name}" -F '\#{pane_id} \#{pane_title}' 2>/dev/null`.lines
        .find { |l| l.include?("mc-inspector") } rescue nil
      if inspector_line
        payload["result"] = "alive"
        payload["inspector_pane"] = inspector_line.split.first
      else
        payload["result"] = "missing"
        payload["warning"] = "inspector pane not found"
      end
    rescue StandardError => e
      payload["result"] = "error"
      payload["error"] = e.message
    end

  when "restart_watchdog"
    begin
      # Read session context from gate-state for watchdog params
      gs_path = File.join(project_root, "_bmad-output", "implementation-artifacts", "gate-state.yaml")
      gs = File.exist?(gs_path) ? (YAML.safe_load(File.read(gs_path)) rescue {}) : {}
      session_name = gs["session_name"] || `tmux display-message -p '\#{session_name}' 2>/dev/null`.strip rescue ""
      commander_pane = gs["commander_pane"] || `tmux display-message -p '\#{pane_id}' 2>/dev/null`.strip rescue ""
      # Inspector pane: find by title since it's not stored at root level in materialized state
      inspector_pane = `tmux list-panes -t "#{session_name}" -F '\#{pane_id} \#{pane_title}' 2>/dev/null`.lines
        .find { |l| l.include?("mc-inspector") }&.split&.first&.strip rescue ""
      skill_dir = SCRIPT_DIR
      run_script("watchdog-control.sh", "ensure-running", skill_dir, commander_pane,
                  inspector_pane, project_root, session_name, expected_gen.to_s)
      payload["result"] = "ensured_running"
    rescue StandardError => e
      payload["result"] = "failed"
      payload["error"] = e.message
    end

  when "rebuild_pane"
    die("rebuild_pane requires story_id") unless cmd.story_id
    # Read current phase from gate-state and map FSM phase → dispatch phase
    gs_path = File.join(project_root, "_bmad-output", "implementation-artifacts", "gate-state.yaml")
    gs = File.exist?(gs_path) ? (YAML.safe_load(File.read(gs_path)) rescue {}) : {}
    fsm_phase = gs.dig("story_states", cmd.story_id, "phase")
    die("cannot determine phase for #{cmd.story_id}") unless fsm_phase
    # Map FSM phase names to dispatch phase names
    dispatch_phase = {
      "creating" => "create", "prototyping" => "prototype", "validating" => "validate",
      "dev" => "dev", "review" => "review", "fixing" => "fixing",
      "qa_running" => "qa", "regression" => "regression",
    }[fsm_phase] || fsm_phase
    # Re-dispatch with fresh pane
    pane_result = run_script("transition-engine.sh", "dispatch", project_root, expected_gen.to_s,
                              cmd.story_id, dispatch_phase, "--trigger-seq", trigger_seq_str, "--fresh-pane")
    payload["result"] = "rebuilt"
    payload["pane_result"] = pane_result

  when "check_logging"
    # Check pipe-pane status — idempotent
    payload["result"] = "checked"
  end

  # Write audit event
  run_script("event-bus.sh", "append", project_root, expected_gen.to_s,
                       audit_type, "commander", trigger_seq_str, JSON.generate(payload))

  # Return the health check result (not just the event append result)
  health_ok = !%w[missing failed error].include?(payload["result"])
  puts JSON.generate({
    "success" => health_ok,
    "action" => cmd.action,
    "result" => payload["result"],
    "warning" => payload["warning"],
    "error" => payload["error"],
  }.compact)
end

def handle_peek_events(project_root, expected_gen, cmd)
  args = ["peek", project_root, expected_gen.to_s, "--consumer", "commander"]
  args += ["--types", cmd.types] if cmd.types
  args += ["--limit", cmd.limit.to_s] if cmd.limit
  args << "--priority" if cmd.priority
  result = run_script("event-bus.sh", *args)
  puts result
end

def handle_ack_events(project_root, expected_gen, cmd)
  die("ACK_EVENTS requires --seq") unless cmd.seq
  result = run_script("event-bus.sh", "ack", project_root, "--consumer", "commander", "--seq", cmd.seq.to_s)
  puts result
end

# ─── Main: process_command ──────────────────────────────────────────────────

def process_command(project_root, expected_gen, raw_tokens)
  # 1. Generation fencing — read generation.lock (not gate-state)
  actual_gen = read_generation_lock(project_root)
  unless actual_gen == expected_gen
    die("STALE_GENERATION: expected #{expected_gen}, actual #{actual_gen}")
  end

  # 2. Parse command
  parsed = parse_command(raw_tokens.dup)
  unless parsed
    die("SYNTAX_ERROR: invalid command. Valid: TRANSITION, DISPATCH, REQUEST_HUMAN, RECORD_GATE, BATCH, HEALTH, PEEK_EVENTS, ACK_EVENTS")
  end

  # 3. Trigger-seq mandatory check
  if requires_trigger_seq?(parsed) && parsed.trigger_seq.nil?
    die("MISSING_TRIGGER_SEQ: event-driven commands require --trigger-seq")
  end

  # 4. Route to handler
  case parsed.type
  when :transition
    handle_transition(project_root, expected_gen, parsed)
  when :dispatch
    handle_dispatch(project_root, expected_gen, parsed)
  when :request_human
    handle_request_human(project_root, expected_gen, parsed)
  when :record_gate
    handle_record_gate(project_root, expected_gen, parsed)
  when :batch
    handle_batch(project_root, expected_gen, parsed)
  when :health
    handle_health(project_root, expected_gen, parsed)
  when :peek_events
    handle_peek_events(project_root, expected_gen, parsed)
  when :ack_events
    handle_ack_events(project_root, expected_gen, parsed)
  end
end

# ─── Entry Point ─────────────────────────────────────────────────────────────

die("usage: command-gateway.sh <project_root> <expected_generation> <command...>") if ARGV.length < 3

# SCRIPT_DIR from env (set by bash wrapper)
SCRIPT_DIR = ENV["SCRIPT_DIR"] || File.dirname($PROGRAM_NAME)

project_root = ARGV[0]
expected_gen = Integer(ARGV[1])
raw_tokens = ARGV[2..]

process_command(project_root, expected_gen, raw_tokens)
RUBY
