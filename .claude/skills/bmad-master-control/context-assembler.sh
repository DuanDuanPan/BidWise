#!/usr/bin/env bash
# context-assembler.sh — Builds decision packets for the commander LLM.
# Implements demand-paging (only inject rules relevant to current event)
# and Harvard architecture (rules channel + data channel separated).
#
# Usage: context-assembler.sh build <project_root> <expected_gen>
#
# Output: JSON array of decision packets to stdout.
# Each packet: { event, state_snapshot, applicable_rules, available_commands }

set -euo pipefail

export SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export RULES_DIR="${SCRIPT_DIR}/rules"

# ── Dispatch to Ruby for all heavy lifting ──────────────────────────────
exec ruby - "$@" <<'RUBY'
require "json"
require "yaml"
require "set"
require "open3"

SCRIPT_DIR  = ENV["SCRIPT_DIR"] || File.expand_path(File.dirname($PROGRAM_NAME))
RULES_DIR   = ENV["RULES_DIR"] || File.join(SCRIPT_DIR, "rules")

# Events that require commander decision packets.
# Housekeeping events (BATCH_SELECTED, STORY_PHASE_CHANGED, GATE_PASSED, etc.)
# are informational and should be auto-acked, not presented to the commander.
ACTIONABLE_EVENTS = Set.new(%w[
  PANE_SIGNAL_DETECTED PANE_IDLE_NO_SENTINEL PANE_TIMEOUT
  HEALTH_ALERT HUMAN_INPUT
]).freeze

# ── Helpers ──────────────────────────────────────────────────────────────

def die(msg)
  $stderr.puts "context-assembler: #{msg}"
  exit 1
end

def run_cmd(cmd)
  out, err, status = Open3.capture3(cmd)
  die "command failed: #{cmd}\n#{err}" unless status.success?
  out.strip
end

def load_rules_file(name)
  path = File.join(RULES_DIR, name)
  return nil unless File.exist?(path)
  File.read(path)
end

def load_gate_state(project_root)
  path = File.join(project_root, "_bmad-output", "implementation-artifacts", "gate-state.yaml")
  return {} unless File.exist?(path)
  YAML.safe_load(File.read(path)) || {}
rescue => e
  $stderr.puts "context-assembler: warning: failed to parse gate-state.yaml: #{e.message}"
  {}
end

# ── Rule File Selection ─────────────────────────────────────────────────
# Demand-paging: only load the rule fragment relevant to this event type.

def select_rules_file(event)
  type = event["type"] || event[:type]
  payload = event["payload"] || event[:payload] || {}

  case type
  when "PANE_SIGNAL_DETECTED"
    signal = payload["signal"] || payload[:signal] || ""
    case signal
    when /^MC_DONE/    then "pane-signal-mc-done.md"
    when "HALT"        then "pane-signal-halt.md"
    when /^ERROR/      then "pane-signal-error.md"
    when "PANE_EXIT"   then "pane-signal-pane-exit.md"
    else nil
    end
  when "PANE_IDLE_NO_SENTINEL"  then "pane-idle-no-sentinel.md"
  when "PANE_TIMEOUT"           then "pane-timeout.md"
  when "HEALTH_ALERT"           then "health-alert.md"
  else nil  # Commander handles directly — no special rules needed
  end
end

# ── Available Commands Generation ────────────────────────────────────────
# Generate the list of valid commands the commander may issue for this
# event type + current story state.

def build_available_commands(event, story_state)
  type    = event["type"]    || event[:type]
  payload = event["payload"] || event[:payload] || {}
  seq     = event["seq"]     || event[:seq]
  story_id = payload["story_id"] || payload[:story_id] || story_state&.dig("story_id") || "UNKNOWN"
  signal   = payload["signal"]   || payload[:signal] || ""
  result   = payload["result"]   || payload[:result] || ""
  phase    = story_state&.dig("phase") || payload["phase"] || payload[:phase] || ""

  commands = []

  case type
  when "PANE_SIGNAL_DETECTED"
    case signal
    when /^MC_DONE/
      # Determine transition based on phase + result
      case phase
      when "creating"
        commands << "TRANSITION #{story_id} create_complete --trigger-seq #{seq}"
      when "prototyping"
        commands << "TRANSITION #{story_id} prototype_complete --trigger-seq #{seq}"
      when "validating"
        if result =~ /PASS/i
          commands << "TRANSITION #{story_id} validate_pass --trigger-seq #{seq}"
        elsif result =~ /FAIL/i
          commands << "TRANSITION #{story_id} validate_fail --trigger-seq #{seq}"
        else
          commands << "TRANSITION #{story_id} validate_pass --trigger-seq #{seq}"
          commands << "TRANSITION #{story_id} validate_fail --trigger-seq #{seq}"
        end
      when "dev", "DEV"
        commands << "TRANSITION #{story_id} dev_complete --trigger-seq #{seq}"
      when "review", "REVIEW"
        if result =~ /PASS/i
          commands << "TRANSITION #{story_id} review_pass --trigger-seq #{seq}"
        elsif result =~ /FAIL/i
          commands << "TRANSITION #{story_id} review_fail --trigger-seq #{seq}"
        else
          commands << "TRANSITION #{story_id} review_pass --trigger-seq #{seq}"
          commands << "TRANSITION #{story_id} review_fail --trigger-seq #{seq}"
        end
      when "qa", "qa_running", "QA"
        if result =~ /PASS/i
          commands << "TRANSITION #{story_id} qa_pass --trigger-seq #{seq}"
        elsif result =~ /FAIL/i
          commands << "TRANSITION #{story_id} qa_fail --trigger-seq #{seq}"
        else
          commands << "TRANSITION #{story_id} qa_pass --trigger-seq #{seq}"
          commands << "TRANSITION #{story_id} qa_fail --trigger-seq #{seq}"
        end
      when "fixing", "FIXING"
        commands << "TRANSITION #{story_id} fix_complete --trigger-seq #{seq}"
      when "regression", "REGRESSION"
        if result =~ /PASS/i
          commands << "TRANSITION #{story_id} regression_pass --trigger-seq #{seq}"
        elsif result =~ /FAIL/i
          commands << "TRANSITION #{story_id} regression_fail --trigger-seq #{seq}"
        else
          commands << "TRANSITION #{story_id} regression_pass --trigger-seq #{seq}"
          commands << "TRANSITION #{story_id} regression_fail --trigger-seq #{seq}"
        end
      end
    when "HALT"
      commands << "REQUEST_HUMAN #{story_id} halt_signal --trigger-seq #{seq}"
    when /^ERROR/
      commands << "HEALTH rebuild_pane #{story_id} --trigger-seq #{seq}"
      commands << "REQUEST_HUMAN #{story_id} error_signal --trigger-seq #{seq}"
      commands << "DISPATCH #{story_id} #{phase} --trigger-seq #{seq}" unless phase.empty?
    when "PANE_EXIT"
      commands << "HEALTH rebuild_pane #{story_id} --trigger-seq #{seq}"
      commands << "REQUEST_HUMAN #{story_id} pane_exit --trigger-seq #{seq}"
    end

  when "PANE_IDLE_NO_SENTINEL"
    # Ambiguous — offer re-dispatch + transition + escalation
    commands << "DISPATCH #{story_id} #{phase} --trigger-seq #{seq}" unless phase.empty?
    commands << "REQUEST_HUMAN #{story_id} idle_no_sentinel --trigger-seq #{seq}"
    # Conditional transition only if commander finds positive evidence
    case phase
    when "dev", "DEV"
      commands << "TRANSITION #{story_id} dev_complete --trigger-seq #{seq}"
    when "review", "REVIEW"
      commands << "TRANSITION #{story_id} review_pass --trigger-seq #{seq}"
      commands << "TRANSITION #{story_id} review_fail --trigger-seq #{seq}"
    when "qa", "QA"
      commands << "TRANSITION #{story_id} qa_pass --trigger-seq #{seq}"
      commands << "TRANSITION #{story_id} qa_fail --trigger-seq #{seq}"
    end

  when "PANE_TIMEOUT"
    commands << "REQUEST_HUMAN #{story_id} timeout --trigger-seq #{seq}"
    commands << "HEALTH rebuild_pane #{story_id} --trigger-seq #{seq}"

  when "HEALTH_ALERT"
    commands << "HEALTH rebuild_pane #{story_id} --trigger-seq #{seq}"
    commands << "REQUEST_HUMAN #{story_id} health_alert --trigger-seq #{seq}"

  else
    # Unknown event types should have been filtered by ACTIONABLE_EVENTS already.
    # Return empty commands — no fallback REQUEST_HUMAN for housekeeping leftovers.
  end

  commands
end

# ── State Snapshot Extraction ────────────────────────────────────────────
# Harvard architecture: extract only the relevant story slice, not full state.

def extract_state_snapshot(gate_state, event)
  payload  = event["payload"] || event[:payload] || {}
  story_id = payload["story_id"] || payload[:story_id]

  return { "note" => "no story_id in event payload" } unless story_id

  story_states = gate_state["story_states"] || {}
  story        = story_states[story_id]

  return { "story_id" => story_id, "note" => "story not found in gate-state" } unless story

  # Return only this story's state — demand-paged, not the full gate-state
  {
    "story_id"         => story_id,
    "phase"            => story["phase"],
    "review_cycle"     => story["review_cycle"],
    "regression_cycle" => story["regression_cycle"],
    "auto_qa_cycle"    => story["auto_qa_cycle"],
    "validation_cycle" => story["validation_cycle"],
    "current_llm"      => story["current_llm"],
    "dispatch_state"   => story["dispatch_state"],
    "c2_override"      => story["c2_override"],
    "worktree_path"    => story["worktree_path"],
    "is_ui"            => story["is_ui"],
    "merge_priority"   => story["merge_priority"]
  }
end

# ── Main: build command ──────────────────────────────────────────────────

def cmd_build(project_root, expected_gen)
  die "project_root does not exist: #{project_root}" unless File.directory?(project_root)

  event_bus = File.join(SCRIPT_DIR, "event-bus.sh")
  die "event-bus.sh not found at #{event_bus}" unless File.exist?(event_bus)

  # 1. Peek pending events from the event bus
  raw = run_cmd(
    "bash #{event_bus} peek #{project_root} #{expected_gen} --consumer commander --priority"
  )

  parsed = begin
    JSON.parse(raw)
  rescue JSON::ParserError => e
    die "failed to parse event-bus output as JSON: #{e.message}\nRaw output: #{raw[0..500]}"
  end

  # event-bus.sh peek returns {"success":true, "events":[...], "cursor":N, "count":N}
  # Extract the events array from the wrapper.
  unless parsed.is_a?(Hash) && parsed.key?("events")
    die "unexpected event-bus peek response format — missing 'events' key\nRaw output: #{raw[0..500]}"
  end
  events = parsed["events"] || []

  # Normalize: ensure we have an array
  events = [events] if events.is_a?(Hash)

  # Filter to only actionable events that need commander decisions.
  # Housekeeping events (BATCH_SELECTED, STORY_PHASE_CHANGED, etc.) are auto-acked.
  events = events.select { |e| ACTIONABLE_EVENTS.include?(e["type"]) }

  if events.empty?
    puts "[]"
    return
  end

  # 2. Load gate-state once
  gate_state = load_gate_state(project_root)

  # 3. Build decision packets
  packets = events.map do |event|
    # Extract state snapshot (Harvard: data channel)
    state_snapshot = extract_state_snapshot(gate_state, event)

    # Select and load applicable rules (Harvard: rules channel)
    rules_file = select_rules_file(event)
    applicable_rules = rules_file ? load_rules_file(rules_file) : nil

    # Determine story phase from state for command generation
    story_state = state_snapshot.is_a?(Hash) ? state_snapshot : {}

    # Build available commands
    available_commands = build_available_commands(event, story_state)

    {
      "event"              => event,
      "state_snapshot"     => state_snapshot,
      "applicable_rules"   => applicable_rules,
      "available_commands" => available_commands
    }
  end

  puts JSON.pretty_generate(packets)
end

# ── CLI Dispatch ─────────────────────────────────────────────────────────

command = ARGV[0]
case command
when "build"
  die "Usage: context-assembler.sh build <project_root> <expected_gen>" if ARGV.length < 3
  cmd_build(ARGV[1], ARGV[2])
else
  die "Unknown command: #{command || '(none)'}\nUsage: context-assembler.sh build <project_root> <expected_gen>"
end
RUBY
