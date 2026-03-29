#!/usr/bin/env bash
# transition-engine.sh — core FSM for master-control v2
# Contains transition tables (pre-dev + dev-and-beyond), preconditions, invariants, side effects.
# All state changes go through this engine; it writes events to event-bus.sh.
#
# Usage:
#   transition-engine.sh execute <project_root> <expected_gen> <story_id> <intent> --trigger-seq <N>
#   transition-engine.sh dispatch <project_root> <expected_gen> <story_id> <phase> --trigger-seq <N> [flags]
#   transition-engine.sh available <project_root> <story_id>
#   transition-engine.sh validate <project_root>
#   transition-engine.sh batch-transition <project_root> <expected_gen> <intent> <story_csv> --trigger-seq <N>

set -euo pipefail

export SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

exec ruby - "$@" <<'RUBY'
require "json"
require "pathname"
require "set"
require "stringio"
require "yaml"
require "fileutils"
require "open3"
require "tempfile"
require "shellwords"
require "timeout"

SCRIPT_DIR = ENV["SCRIPT_DIR"] || File.dirname($PROGRAM_NAME)

# ─── Constants ───────────────────────────────────────────────────────────────

# Default LLM assignment per phase (C2 rule)
LLM_FOR_PHASE = {
  "create"     => "claude",
  "prototype"  => "claude",
  "validate"   => "codex",
  "dev"        => "claude",
  "review"     => "codex",
  "fixing"     => "claude",
  "qa"         => "codex",
  "regression" => "codex",
  "noop"       => "claude",
}.freeze

DEFAULT_CONFIG = {
  "max_review_cycles"     => 3,
  "max_regression_cycles" => 3,
  "max_validation_cycles" => 3,
}.freeze

# ─── Pre-Dev Transition Table ────────────────────────────────────────────────

PRE_DEV_TRANSITIONS = {
  ["queued", "create_dispatched"] => {
    target: "creating",
    preconditions: [:g1_passed, :story_not_yet_created],
    side_effects: [],
  },
  ["creating", "create_complete"] => {
    target: "created",
    preconditions: [:story_file_exists_on_disk],
    side_effects: [],
  },
  ["created", "prototype_dispatched"] => {
    target: "prototyping",
    preconditions: [:is_ui_story],
    side_effects: [],
  },
  ["created", "skip_prototype"] => {
    target: "prototyped",
    preconditions: [:is_not_ui_story],
    side_effects: [],
  },
  ["prototyping", "prototype_complete"] => {
    target: "prototyped",
    preconditions: [:pen_file_exists],
    side_effects: [],
  },
  ["prototyped", "validate_dispatched"] => {
    target: "validating",
    preconditions: [:g2_passed],
    side_effects: [],
  },
  ["validating", "validate_pass"] => {
    target: "validated",
    preconditions: [],
    side_effects: [],
  },
  ["validating", "validate_fail"] => {
    target: "created",
    preconditions: [:validation_cycle_under_limit],
    side_effects: [:increment_validation_cycle],
  },
  ["validated", "batch_committed"] => {
    target: "committed",
    preconditions: [:all_batch_stories_validated],
    side_effects: [:record_gate_g4],
  },
  ["committed", "g5_approved"] => {
    target: "dev_ready",
    preconditions: [:g5_recorded_by_inspector],
    side_effects: [],
  },
  ["dev_ready", "dev_dispatched"] => {
    target: "dev",
    preconditions: [:worktree_created],
    side_effects: [:record_gate_g6],
  },
}.freeze

# ─── Dev-and-Beyond Transition Table ─────────────────────────────────────────

PHASE_TRANSITIONS = {
  ["dev", "dev_complete"] => {
    target: "pending_review",
    preconditions: [:source_files_exist],
    side_effects: [:clear_dispatch_state],
  },
  ["pending_review", "g7_pass"] => {
    target: "review",
    preconditions: [:g7_not_yet_recorded],
    side_effects: [:record_gate_g7],
  },
  ["review", "review_pass"] => {
    target: "auto_qa_pending",
    preconditions: [],
    side_effects: [:record_gate_g8],
    pane_actions: [:close_review_pane, :clear_review_pane_ref],
  },
  ["review", "review_fail"] => {
    target: "fixing",
    preconditions: [:review_cycle_under_limit],
    side_effects: [:increment_review_cycle],
    pane_actions: [:close_review_pane, :clear_review_pane_ref],
  },
  ["fixing", "fix_complete"] => {
    target: "pending_review",
    preconditions: [],
    side_effects: [:clear_dispatch_state],
  },
  ["auto_qa_pending", "qa_dispatched"] => {
    target: "qa_running",
    preconditions: [],
    side_effects: [],
  },
  ["qa_running", "qa_pass"] => {
    target: "uat_waiting",
    preconditions: [],
    side_effects: [:record_gate_g9],
    pane_actions: [:close_qa_pane, :clear_qa_pane_ref],
  },
  ["qa_running", "qa_fail"] => {
    target: "fixing",
    preconditions: [],
    side_effects: [],
    pane_actions: [:close_qa_pane, :clear_qa_pane_ref],
  },
  ["uat_waiting", "uat_pass"] => {
    target: "pre_merge",
    preconditions: [],
    side_effects: [],
  },
  ["uat_waiting", "uat_fail"] => {
    target: "fixing",
    preconditions: [],
    side_effects: [:reset_review_cycle],
  },
  ["pre_merge", "g10_approved"] => {
    target: "merged",
    preconditions: [:g10_recorded_by_inspector],
    side_effects: [:execute_merge],
    irreversible: true,
  },
  ["merged", "regression_start"] => {
    target: "regression",
    preconditions: [],
    side_effects: [],
  },
  ["regression", "regression_pass"] => {
    target: "done",
    preconditions: [],
    side_effects: [:record_gate_g11],
  },
  ["regression", "regression_fail"] => {
    target: "regression",
    preconditions: [:regression_cycle_under_limit],
    side_effects: [:increment_regression_cycle],
  },
}.freeze

ALL_TRANSITIONS = PRE_DEV_TRANSITIONS.merge(PHASE_TRANSITIONS).freeze

# ─── Invariants (checked before commit point) ───────────────────────────────

def check_invariants(target_state, story_id, config)
  errors = []

  phase = target_state["phase"]
  llm = target_state["current_llm"]
  c2 = target_state["c2_override"]

  # C2: review/qa/regression must use codex (unless override)
  if %w[review qa_running regression].include?(phase)
    if llm != "codex" && c2 != true
      errors << "C2_review_llm: #{phase} requires codex, got #{llm}"
    end
  end

  # C2: fixing defaults to claude; cycle >= 2 can use codex
  if phase == "fixing"
    if llm != "claude" && !(llm == "codex" && (target_state["review_cycle"] || 0) >= 2) && c2 != true
      errors << "C2_fixing_llm: fixing expects claude (or codex at cycle>=2), got #{llm}"
    end
  end

  # Cycle limits
  rc = target_state["review_cycle"] || 0
  max_rc = config["max_review_cycles"] || 3
  errors << "review_cycle_limit: #{rc} > #{max_rc}" if rc > max_rc

  regc = target_state["regression_cycle"] || 0
  max_regc = config["max_regression_cycles"] || 3
  errors << "regression_cycle_limit: #{regc} > #{max_regc}" if regc > max_regc

  vc = target_state["validation_cycle"] || 0
  max_vc = config["max_validation_cycles"] || 3
  errors << "validation_cycle_limit: #{vc} > #{max_vc}" if vc > max_vc

  errors
end

# ─── Helpers ─────────────────────────────────────────────────────────────────

def die(msg, code = 1)
  puts JSON.generate({"success" => false, "error" => msg})
  exit code
end

def artifacts_dir(project_root)
  Pathname(project_root) + "_bmad-output" + "implementation-artifacts"
end

def runtime_dir(project_root, session_name, generation)
  artifacts_dir(project_root) + "runtime" + "#{session_name}-g#{generation}"
end

def runtime_mc_logs_dir(project_root, session_name, generation)
  runtime_dir(project_root, session_name, generation) + "mc-logs"
end

def runtime_pane_log_file(project_root, session_name, generation, pane_id)
  runtime_mc_logs_dir(project_root, session_name, generation) + "pane-#{pane_id.to_s.delete('%')}.log"
end

def diag_log_path(project_root)
  artifacts_dir(project_root) + "master-control-diagnostics.log"
end

def diag_log(project_root, event, fields = {})
  path = diag_log_path(project_root)
  path.dirname.mkpath
  entry = {
    "ts" => Time.now.utc.strftime("%Y-%m-%dT%H:%M:%S.%3NZ"),
    "script" => "transition-engine.sh",
    "pid" => Process.pid,
    "event" => event,
  }.merge(fields)

  File.open(path.to_s, File::WRONLY | File::CREAT | File::APPEND, 0o644) do |file|
    file.flock(File::LOCK_EX)
    file.puts(JSON.generate(entry))
  end
rescue StandardError
  nil
end

def pane_diag_snapshot(session_name)
  list_session_panes(session_name).map do |pane|
    {
      "pane_id" => pane["pane_id"],
      "top" => pane["top"],
      "left" => pane["left"],
      "title" => pane["title"],
      "command" => pane["command"],
    }
  end
rescue StandardError
  []
end

def pane_diag_summary(pane)
  return nil unless pane.is_a?(Hash)

  {
    "pane_id" => pane["pane_id"],
    "top" => pane["top"],
    "left" => pane["left"],
    "title" => pane["title"],
    "command" => pane["command"],
  }
end

def log_excerpt(text, max_lines: 20, max_chars: 1200)
  lines = text.to_s.lines.last(max_lines).join
  return lines if lines.length <= max_chars

  lines[-max_chars, max_chars]
end

def worker_slug(story_id, phase)
  "#{story_id}-#{phase}".gsub(/[^A-Za-z0-9._-]/, "_")
end

def worker_runtime_dir(project_root, session_name, generation, story_id, phase)
  runtime_dir(project_root, session_name, generation) + "workers" + worker_slug(story_id, phase)
end

def worker_control_fifo(project_root, session_name, generation, story_id, phase)
  worker_runtime_dir(project_root, session_name, generation, story_id, phase) + "control.fifo"
end

def worker_boot_token_file(project_root, session_name, generation, story_id, phase)
  worker_runtime_dir(project_root, session_name, generation, story_id, phase) + "worker-boot.token"
end

def worker_bootstrap_file(project_root, session_name, generation, story_id, phase)
  worker_runtime_dir(project_root, session_name, generation, story_id, phase) + "bootstrap.txt"
end

def worker_id_for(story_id, phase)
  "#{story_id}:#{phase}"
end

def worker_title_for(story_id, phase)
  "mc-story-#{story_id}-#{phase}"
end

def worker_role_for_dispatch(phase, fresh_pane: false)
  return "dev" if phase == "fixing" && !fresh_pane

  phase
end

def gate_state_path(project_root)
  artifacts_dir(project_root) + "gate-state.yaml"
end

def load_yaml_safe(path, default = {})
  return default unless path.exist?
  loaded = YAML.load_file(path)
  loaded.is_a?(Hash) ? loaded : default
rescue StandardError
  default
end

def load_gate_state(project_root)
  load_yaml_safe(gate_state_path(project_root))
end

def clean_terminal_output(text)
  text.to_s
    .dup
    .force_encoding(Encoding::UTF_8)
    .scrub
    .gsub(/\e\[[0-9;?]*[ -\/]*[@-~]/, "")
    .gsub(/\e\][^\a]*(?:\a|\e\\)/, "")
    .gsub(/\r/, "\n")
end

def pane_log_size(log_file)
  File.exist?(log_file) ? File.size(log_file) : 0
rescue StandardError
  0
end

def pane_log_text(log_file)
  return "" unless File.exist?(log_file)
  clean_terminal_output(File.binread(log_file))
rescue StandardError
  ""
end

def wait_for_log_condition(log_file, timeout_sec: 30, start_pos: 0)
  deadline = Time.now + timeout_sec
  loop do
    text = if File.exist?(log_file)
      raw = File.binread(log_file)
      chunk = raw.byteslice(start_pos, raw.bytesize - start_pos) || "".b
      clean_terminal_output(chunk)
    else
      ""
    end
    result = yield text
    return result unless result.nil? || result == false
    return nil if Time.now >= deadline
    sleep 1
  end
end

def task_ack_boot_snapshot(boot_token_file)
  return {} unless boot_token_file && File.exist?(boot_token_file)
  parse_boot_token(boot_token_file)
rescue StandardError
  {}
end

def wait_for_log_substrings(log_file, substrings, timeout_sec: 30, start_pos: 0)
  wait_for_log_condition(log_file, timeout_sec: timeout_sec, start_pos: start_pos) do |text|
    Array(substrings).find { |needle| text.include?(needle) }
  end
end

def parse_boot_token(path)
  return {} unless File.exist?(path)
  File.read(path).each_line.with_object({}) do |line, acc|
    key, value = line.strip.split("=", 2)
    acc[key] = value if key && value
  end
rescue StandardError
  {}
end

def process_alive?(pid_str)
  Process.kill(0, Integer(pid_str))
  true
rescue StandardError
  false
end

def pane_alive?(session_name, pane_id)
  stdout, = Open3.capture2("tmux", "list-panes", "-t", session_name.to_s, "-F", '#{pane_id}')
  stdout.lines.map(&:strip).include?(pane_id.to_s)
rescue StandardError
  false
end

def shell_command_name?(command)
  %w[bash zsh sh fish].include?(command.to_s)
end

def list_session_panes(session_name)
  stdout, stderr, status = Open3.capture3(
    "tmux", "list-panes", "-t", session_name.to_s,
    "-F", "\#{pane_id}\t\#{pane_top}\t\#{pane_left}\t\#{pane_title}\t\#{pane_current_command}"
  )
  die("cannot inspect panes for session '#{session_name}': #{stderr.strip}") unless status.success?

  stdout.lines.map do |line|
    pane_id, top, left, title, command = line.chomp.split("\t", 5)
    {
      "pane_id" => pane_id.to_s,
      "top" => Integer(top || 0),
      "left" => Integer(left || 0),
      "title" => title.to_s,
      "command" => command.to_s,
    }
  end
end

def placeholder_shell_command
  shell = ENV["SHELL"].to_s
  shell = "/bin/zsh" if shell.empty?
  "exec #{Shellwords.escape(shell)} -il"
end

def sync_runtime_panes(project_root, expected_gen, utility_pane, inspector_pane, bottom_anchor)
  return if utility_pane.to_s.empty? || inspector_pane.to_s.empty? || bottom_anchor.to_s.empty?

  state_control = File.join(SCRIPT_DIR, "state-control.sh")
  stdout, stderr, status = Open3.capture3(
    "bash", state_control, "sync-runtime-panes",
    project_root.to_s, expected_gen.to_s, utility_pane.to_s, inspector_pane.to_s, bottom_anchor.to_s
  )
  die("state-control sync-runtime-panes failed: #{stderr.strip.empty? ? stdout.strip : stderr.strip}") unless status.success?
end

def ensure_live_bottom_anchor(project_root:, expected_gen:, session_name:, commander_pane:,
                              inspector_pane:, utility_pane:, current_bottom_anchor:)
  panes = list_session_panes(session_name)
  bottom_panes = panes.select { |p| p["top"] > 0 }.sort_by { |p| [p["left"], p["top"]] }
  diag_log(project_root, "ensure_live_bottom_anchor.begin", {
    "expected_generation" => expected_gen,
    "session_name" => session_name.to_s,
    "commander_pane" => commander_pane.to_s,
    "inspector_pane" => inspector_pane.to_s,
    "utility_pane" => utility_pane.to_s,
    "current_bottom_anchor" => current_bottom_anchor.to_s,
    "bottom_panes" => bottom_panes.map { |pane| pane_diag_summary(pane) },
  })

  selection_reason = nil
  anchor =
    if current_bottom_anchor && bottom_panes.any? { |p| p["pane_id"] == current_bottom_anchor }
      selection_reason = "current_anchor_alive"
      current_bottom_anchor
    else
      selection_reason = bottom_panes.empty? ? "recreate_from_commander" : "fallback_first_bottom"
      bottom_panes.first&.dig("pane_id")
    end

  if anchor.to_s.empty?
    stdout, stderr, status = Open3.capture3(
      "tmux", "split-window",
      "-t", commander_pane.to_s,
      "-v",
      "-l", "40%",
      "-P",
      "-F", '#{pane_id}',
      placeholder_shell_command
    )
    die("failed to recreate bottom anchor: #{stderr.strip.empty? ? stdout.strip : stderr.strip}") unless status.success?
    anchor = stdout.strip
    panes = list_session_panes(session_name)
    diag_log(project_root, "ensure_live_bottom_anchor.recreated", {
      "expected_generation" => expected_gen,
      "session_name" => session_name.to_s,
      "commander_pane" => commander_pane.to_s,
      "selected_anchor" => anchor.to_s,
      "stdout" => stdout.strip,
      "stderr" => stderr.strip,
      "exit_status" => status.exitstatus,
      "panes_after" => pane_diag_snapshot(session_name),
    })
  end

  anchor_pane = panes.find { |p| p["pane_id"] == anchor.to_s }
  anchor_is_placeholder = anchor_pane && shell_command_name?(anchor_pane["command"]) && !anchor_pane["title"].to_s.start_with?("mc-story-")
  if anchor_is_placeholder
    system("tmux", "select-pane", "-t", anchor, "-T", "mc-bottom-anchor")
    system("tmux", "set-option", "-p", "-t", anchor, "allow-rename", "off")
  end
  diag_log(project_root, "ensure_live_bottom_anchor.selected", {
    "expected_generation" => expected_gen,
    "session_name" => session_name.to_s,
    "current_bottom_anchor" => current_bottom_anchor.to_s,
    "selected_anchor" => anchor.to_s,
    "selection_reason" => selection_reason.to_s,
    "anchor_changed" => current_bottom_anchor.to_s != anchor.to_s,
    "anchor_is_placeholder" => anchor_is_placeholder,
    "anchor_pane" => pane_diag_summary(anchor_pane),
    "panes_after" => pane_diag_snapshot(session_name),
  })
  sync_runtime_panes(project_root, expected_gen, utility_pane, inspector_pane, anchor)
  diag_log(project_root, "ensure_live_bottom_anchor.synced", {
    "expected_generation" => expected_gen,
    "session_name" => session_name.to_s,
    "selected_anchor" => anchor.to_s,
    "utility_pane" => utility_pane.to_s,
    "inspector_pane" => inspector_pane.to_s,
  })
  anchor
end

def release_worker_pane(pane_id:, bottom_anchor:)
  return if pane_id.to_s.empty?

  if pane_id.to_s == bottom_anchor.to_s
    stdout, stderr, status = Open3.capture3(
      "tmux", "respawn-pane", "-k", "-t", pane_id.to_s, placeholder_shell_command
    )
    die("failed to restore bottom anchor #{pane_id}: #{stderr.strip.empty? ? stdout.strip : stderr.strip}") unless status.success?
    system("tmux", "select-pane", "-t", pane_id.to_s, "-T", "mc-bottom-anchor")
    system("tmux", "set-option", "-p", "-t", pane_id.to_s, "allow-rename", "off")
  else
    system("tmux", "kill-pane", "-t", pane_id.to_s, [:out, :err] => "/dev/null")
  end
end

def wrapper_running?(session_name, pane_id, boot_token_file)
  return false unless pane_alive?(session_name, pane_id)
  token = parse_boot_token(boot_token_file)
  return false if token["wrapper_pid"].to_s.empty?
  process_alive?(token["wrapper_pid"])
end

def ensure_fifo(path)
  FileUtils.mkdir_p(File.dirname(path))
  File.delete(path) if File.exist?(path) && !File.ftype(path).eql?("fifo")
  system("mkfifo", path.to_s) unless File.exist?(path)
end

def agent_command_for(llm)
  case llm
  when "codex"
    ENV["MC_CODEX_AGENT_COMMAND"].to_s.empty? ? "codex --no-alt-screen --dangerously-bypass-approvals-and-sandbox" : ENV["MC_CODEX_AGENT_COMMAND"]
  else
    ENV["MC_CLAUDE_AGENT_COMMAND"].to_s.empty? ? "claude --dangerously-skip-permissions" : ENV["MC_CLAUDE_AGENT_COMMAND"]
  end
end

def worker_ready_timeout_sec
  Integer(ENV.fetch("MC_WORKER_READY_TIMEOUT", "120"))
rescue ArgumentError
  120
end

def worker_reuse_ready_timeout_sec
  Integer(ENV.fetch("MC_WORKER_REUSE_READY_TIMEOUT", "30"))
rescue ArgumentError
  30
end

def worker_bootstrap_timeout_sec
  Integer(ENV.fetch("MC_WORKER_BOOTSTRAP_TIMEOUT", "10"))
rescue ArgumentError
  10
end

def worker_bootstrap_retries_count
  Integer(ENV.fetch("MC_WORKER_BOOTSTRAP_RETRIES", "3"))
rescue ArgumentError
  3
end

def worker_ack_timeout_sec
  Integer(ENV.fetch("MC_WORKER_ACK_TIMEOUT", "20"))
rescue ArgumentError
  20
end

def worker_begin_timeout_sec
  Integer(ENV.fetch("MC_WORKER_BEGIN_TIMEOUT", "120"))
rescue ArgumentError
  120
end

def write_task_monitor_log_cursor(project_root, session_name, generation, pane_id, cursor_value)
  cursor_file = runtime_dir(project_root, session_name, generation) + "task-monitor-log-cursors.tmp"
  FileUtils.mkdir_p(File.dirname(cursor_file))
  existing = File.exist?(cursor_file) ? File.read(cursor_file).lines : []
  kept = existing.reject { |line| line.start_with?("#{pane_id}=") }
  File.write(cursor_file, kept.join + "#{pane_id}=#{cursor_value}\n")
end

def resolve_story_key(project_root, story_id)
  development_status = load_yaml_safe(artifacts_dir(project_root) + "sprint-status.yaml", {})["development_status"]
  return story_id if development_status.is_a?(Hash) && development_status.key?(story_id)
  return nil unless development_status.is_a?(Hash)

  matched_key = development_status.keys.find do |key|
    key_str = key.to_s
    key_str == story_id || key_str.start_with?("#{story_id}-")
  end
  matched_key&.to_s
end

def split_protocol_token(token)
  case token
  when /^MC_(.+)$/
    %("MC" followed immediately by "_#{$1}")
  when /^HALT/
    %("HA" followed immediately by "LT")
  else
    %("#{token}")
  end
end

def protocol_literal(line)
  parts = line.split(" ", 2)
  token = parts.first
  rest = parts[1]
  return split_protocol_token(token) if rest.to_s.empty?
  %(#{split_protocol_token(token)} then a single space and "#{rest}")
end

def event_bus(*args)
  cmd = [File.join(SCRIPT_DIR, "event-bus.sh")] + args.map(&:to_s)
  stdout, stderr, status = Open3.capture3(*cmd)
  unless status.success?
    error_msg = stderr.strip.empty? ? stdout.strip : stderr.strip
    die("event-bus.sh failed: #{error_msg}")
  end
  stdout.strip
end

def find_event_in_log(project_root, type, trigger_seq, story_id = nil, phase = nil)
  # Read event-log directly (trusted zone) instead of using peek with a generation
  el_path = Pathname(project_root) + "_bmad-output" + "implementation-artifacts" + "event-log.yaml"
  return nil unless el_path.exist?
  log = YAML.load_file(el_path) rescue nil
  return nil unless log.is_a?(Hash)
  events = log["events"] || []

  events.find do |e|
    next unless e["type"] == type
    match = e["trigger_seq"].to_s == trigger_seq.to_s
    match &&= e.dig("payload", "story_id") == story_id if story_id
    match &&= e.dig("payload", "phase") == phase if phase
    match
  end
end

# ─── Precondition Evaluators ─────────────────────────────────────────────────

def evaluate_precondition(name, project_root, state, story_id, config)
  case name
  when :g1_passed
    gates = state["gates"] || {}
    gates.dig("G1", "status") == "PASS"

  when :story_not_yet_created
    ss = state.dig("story_states", story_id) || {}
    ss["phase"].nil? || ss["phase"] == "queued"

  when :story_file_exists_on_disk
    ss = state.dig("story_states", story_id) || {}
    rel = ss["story_file_rel"] || "_bmad-output/implementation-artifacts/story-#{story_id}.md"
    File.exist?(File.join(project_root, rel))

  when :is_ui_story
    ss = state.dig("story_states", story_id) || {}
    ss["is_ui"] == true

  when :is_not_ui_story
    ss = state.dig("story_states", story_id) || {}
    ss["is_ui"] != true

  when :pen_file_exists
    # Check for .pen prototype file
    Dir.glob(File.join(project_root, "_bmad-output", "**", "*#{story_id}*.pen")).any?

  when :g2_passed
    gates = state["gates"] || {}
    gates.dig("G2", "status") == "PASS"

  when :validation_cycle_under_limit
    ss = state.dig("story_states", story_id) || {}
    vc = ss["validation_cycle"] || 0
    max = config["max_validation_cycles"] || 3
    vc < max

  when :all_batch_stories_validated
    # Accept both "validated" (not yet committed) and "committed" (already committed
    # by a prior story in the same batch-transition call) as passing
    stories = state["batch_stories"] || []
    stories.all? do |sid|
      ss = state.dig("story_states", sid) || {}
      %w[validated committed].include?(ss["phase"])
    end

  when :g5_recorded_by_inspector
    gates = state["gates"] || {}
    gates.dig("G5", "status") == "PASS"

  when :worktree_created
    ss = state.dig("story_states", story_id) || {}
    wt = ss["worktree_path"] || "../BidWise-story-#{story_id}"
    File.directory?(wt)

  when :source_files_exist
    ss = state.dig("story_states", story_id) || {}
    wt = ss["worktree_path"] || "../BidWise-story-#{story_id}"
    File.directory?(wt)

  when :g7_not_yet_recorded
    story_gates = state.dig("story_gates", story_id) || {}
    story_gates.dig("G7", "status") != "PASS"

  when :review_cycle_under_limit
    ss = state.dig("story_states", story_id) || {}
    rc = ss["review_cycle"] || 0
    max = config["max_review_cycles"] || 3
    rc < max

  when :g10_recorded_by_inspector
    story_gates = state.dig("story_gates", story_id) || {}
    story_gates.dig("G10", "status") == "PASS"

  when :regression_cycle_under_limit
    ss = state.dig("story_states", story_id) || {}
    rc = ss["regression_cycle"] || 0
    max = config["max_regression_cycles"] || 3
    rc < max

  else
    die("unknown precondition: #{name}")
  end
end

# ─── Side Effect Executors ───────────────────────────────────────────────────

def execute_side_effect(name, project_root, expected_gen, state, story_id, trigger_seq)
  case name
  when :clear_dispatch_state
    # Dispatch state cleared in the STORY_PHASE_CHANGED event payload
    # No separate action needed — it's set to nil in the event

  when :increment_validation_cycle
    # Handled via the event payload — validation_cycle incremented

  when :increment_review_cycle
    # Handled via the event payload — review_cycle incremented

  when :increment_regression_cycle
    # Handled via the event payload — regression_cycle incremented

  when :reset_review_cycle
    # Handled via the event payload — review_cycle set to 0

  when :record_gate_g4
    payload = {"gate" => "G4", "verified_by" => "transition_engine", "details" => "all_batch_stories_validated"}
    event_bus("append", project_root, expected_gen.to_s, "GATE_PASSED", "transition_engine", trigger_seq.to_s, JSON.generate(payload))

  when :record_gate_g6
    payload = {"gate" => "G6", "story_id" => story_id, "verified_by" => "transition_engine", "details" => "worktree_created"}
    event_bus("append", project_root, expected_gen.to_s, "GATE_PASSED", "transition_engine", trigger_seq.to_s, JSON.generate(payload))

  when :record_gate_g7
    payload = {"gate" => "G7", "story_id" => story_id, "verified_by" => "transition_engine", "details" => "source_files_exist"}
    event_bus("append", project_root, expected_gen.to_s, "GATE_PASSED", "transition_engine", trigger_seq.to_s, JSON.generate(payload))

  when :record_gate_g8
    payload = {"gate" => "G8", "story_id" => story_id, "verified_by" => "transition_engine", "details" => "review_pass"}
    event_bus("append", project_root, expected_gen.to_s, "GATE_PASSED", "transition_engine", trigger_seq.to_s, JSON.generate(payload))

  when :record_gate_g9
    payload = {"gate" => "G9", "story_id" => story_id, "verified_by" => "transition_engine", "details" => "qa_pass"}
    event_bus("append", project_root, expected_gen.to_s, "GATE_PASSED", "transition_engine", trigger_seq.to_s, JSON.generate(payload))

  when :record_gate_g11
    payload = {"gate" => "G11", "story_id" => story_id, "verified_by" => "transition_engine", "details" => "regression_pass"}
    event_bus("append", project_root, expected_gen.to_s, "GATE_PASSED", "transition_engine", trigger_seq.to_s, JSON.generate(payload))

  when :execute_merge
    # Irreversible side effect — check if already merged first
    ss = state.dig("story_states", story_id) || {}
    wt_path = ss["worktree_path"] || "../BidWise-story-#{story_id}"

    # Check if already merged via git log
    stdout, _, status = Open3.capture3("git", "log", "main", "--oneline", "--grep=story-#{story_id}", chdir: project_root)
    if status.success? && stdout.include?("story-#{story_id}")
      # Already merged — skip
      return
    end

    # Execute merge via worktree.sh
    stdout, stderr, status = Open3.capture3(
      File.join(project_root, "scripts", "worktree.sh"), "merge", story_id,
      chdir: project_root
    )
    unless status.success?
      die("merge failed for #{story_id}: #{stderr.strip.empty? ? stdout.strip : stderr.strip}")
    end

  when :close_review_pane, :close_qa_pane
    # Pane cleanup — close the pane and emit PANE_CLOSED event
    role = name == :close_review_pane ? "review" : "qa"
    pane_id = state.dig("panes", "stories", story_id, role)
    if pane_id
      system("tmux", "kill-pane", "-t", pane_id, [:out, :err] => "/dev/null")
      payload = {"story_id" => story_id, "role" => role, "pane_id" => pane_id}
      event_bus("append", project_root, expected_gen.to_s, "PANE_CLOSED", "transition_engine", trigger_seq.to_s, JSON.generate(payload))
    end

  when :clear_review_pane_ref, :clear_qa_pane_ref
    # Ref cleared by PANE_CLOSED materialization — no extra action needed

  else
    warn "transition-engine.sh: unknown side effect: #{name}"
  end
end

# ─── Execute Transition ──────────────────────────────────────────────────────

def prepare_transition_commit(project_root, state, story_id, intent, config, overrides = {})
  ss = state.dig("story_states", story_id)
  die("unknown story: #{story_id}") unless ss

  current_phase = ss["phase"] || "queued"
  transition = ALL_TRANSITIONS[[current_phase, intent]]
  die("INVALID_TRANSITION: no transition from '#{current_phase}' via '#{intent}'") unless transition

  transition[:preconditions].each do |precond|
    unless evaluate_precondition(precond, project_root, state, story_id, config)
      die("PRECONDITION_FAILED: #{precond} for story #{story_id} in phase #{current_phase}")
    end
  end

  target = ss.dup
  target["phase"] = transition[:target]
  target["dispatch_state"] = nil if transition[:side_effects].include?(:clear_dispatch_state)

  if transition[:side_effects].include?(:increment_validation_cycle)
    target["validation_cycle"] = (target["validation_cycle"] || 0) + 1
  end
  if transition[:side_effects].include?(:increment_review_cycle)
    target["review_cycle"] = (target["review_cycle"] || 0) + 1
  end
  if transition[:side_effects].include?(:increment_regression_cycle)
    target["regression_cycle"] = (target["regression_cycle"] || 0) + 1
  end
  if transition[:side_effects].include?(:reset_review_cycle)
    target["review_cycle"] = 0
  end

  overrides.each do |key, value|
    target[key] = value
  end

  invariant_errors = check_invariants(target, story_id, config)
  unless invariant_errors.empty?
    die("INVARIANT_VIOLATION: #{invariant_errors.join('; ')}")
  end

  {
    "current_phase" => current_phase,
    "transition" => transition,
    "target" => target,
  }
end

def append_story_phase_changed(project_root, expected_gen, story_id, intent, current_phase, target, trigger_seq)
  payload = {
    "story_id" => story_id,
    "from_phase" => current_phase,
    "to_phase" => target["phase"],
    "intent" => intent,
    "review_cycle" => target["review_cycle"] || 0,
    "regression_cycle" => target["regression_cycle"] || 0,
    "auto_qa_cycle" => target["auto_qa_cycle"] || 0,
    "validation_cycle" => target["validation_cycle"] || 0,
    "current_llm" => target["current_llm"] || "claude",
    "dispatch_state" => target["dispatch_state"],
    "c2_override" => target["c2_override"] || false,
  }

  event_bus("append", project_root, expected_gen.to_s, "STORY_PHASE_CHANGED",
            "transition_engine", trigger_seq.to_s, JSON.generate(payload))
end

def cmd_execute(project_root, expected_gen, story_id, intent, trigger_seq)
  # 1. Dedup: check if this trigger-seq already produced a STORY_PHASE_CHANGED
  existing = find_event_in_log(project_root, "STORY_PHASE_CHANGED", trigger_seq, story_id)
  if existing
    puts JSON.generate({"success" => true, "already_applied" => true, "event_seq" => existing["seq"], "phase" => existing.dig("payload", "to_phase")})
    return
  end

  # 2. Load state
  state = load_gate_state(project_root)
  config = state["config"] || DEFAULT_CONFIG
  transition_plan = prepare_transition_commit(project_root, state, story_id, intent, config)
  current_phase = transition_plan.fetch("current_phase")
  transition = transition_plan.fetch("transition")
  target = transition_plan.fetch("target")

  # 7. Execute side effects
  #    Irreversible effects (merge) execute BEFORE commit point with verification
  if transition[:irreversible]
    transition[:side_effects].each do |effect|
      execute_side_effect(effect, project_root, expected_gen, state, story_id, trigger_seq)
    end
  end

  # Reversible side effects (pane close, gate record)
  unless transition[:irreversible]
    transition[:side_effects].each do |effect|
      next if [:increment_validation_cycle, :increment_review_cycle,
               :increment_regression_cycle, :reset_review_cycle,
               :clear_dispatch_state].include?(effect)
      execute_side_effect(effect, project_root, expected_gen, state, story_id, trigger_seq)
    end
  end

  # Pane actions
  (transition[:pane_actions] || []).each do |action|
      execute_side_effect(action, project_root, expected_gen, state, story_id, trigger_seq)
    end

  # 8. Write STORY_PHASE_CHANGED event (commit point)
  append_story_phase_changed(project_root, expected_gen, story_id, intent, current_phase, target, trigger_seq)

  # 9. Materialize gate-state
  event_bus("materialize", project_root)

  puts JSON.generate({
    "success" => true,
    "story_id" => story_id,
    "from_phase" => current_phase,
    "to_phase" => transition[:target],
    "intent" => intent,
  })
end

# ─── Dispatch ────────────────────────────────────────────────────────────────

# Maps dispatch phase to the FSM intent that advances the story
DISPATCH_INTENT_MAP = {
  "create"     => "create_dispatched",
  "prototype"  => "prototype_dispatched",
  "validate"   => "validate_dispatched",
  "dev"        => "dev_dispatched",
  "qa"         => "qa_dispatched",
  "regression" => "regression_start",
  "noop"       => nil,
  # review/fixing: phase already advanced by prior TRANSITION (review_fail, g7_pass)
}.freeze

DISPATCH_TARGET_PHASE = {
  "create" => "creating",
  "prototype" => "prototyping",
  "validate" => "validating",
  "dev" => "dev",
  "qa" => "qa_running",
  "regression" => "regression",
}.freeze

# Worker bootstrap packet — puts the pane into resident protocol mode.
def build_worker_bootstrap(worker_role, story_id, worker_id)
  <<~BOOTSTRAP
    You are entering BidWise master-control worker protocol mode.
    Worker id: #{worker_id}
    Worker role: #{worker_role} for story #{story_id}.

    Stay resident in this terminal until explicitly interrupted.
    When you are ready to accept tasks, print exactly one line formed by #{protocol_literal("MC_WORKER_READY #{worker_id}")}.

    After that, wait for task blocks in this exact envelope:
    TASK <task_id> <phase> <story_id>
    <payload lines>
    END_TASK

    For every task block:
    - Immediately print exactly one line formed by #{protocol_literal("MC_ACK <task_id>")}.
    - When you actually begin executing the task, print exactly one line formed by #{protocol_literal("MC_BEGIN <task_id>")}.
    - Follow the payload instructions autonomously.
    - Never ask the user follow-up questions. If required input is missing or inconsistent, stop and print exactly one line formed by #{protocol_literal("HALT <task_id> <REASON>")}. Use machine-readable reason tokens such as MISSING_INPUT, INVALID_TARGET, TOOL_FAILURE, BLOCKED, or CONTRACT_VIOLATION.
    - On success, finish with exactly one line formed by #{protocol_literal("MC_DONE <phase> <story_id> <RESULT>")}. Keep the phase and story_id from the TASK header. RESULT must be a single machine-readable token.
    - Never exit after a task. Return to waiting for the next TASK block.
  BOOTSTRAP
end

# Task payload templates per phase (business instructions inside TASK ... END_TASK).
def build_task_payload(phase, story_id, project_root, state, opts)
  ss = state.dig("story_states", story_id) || {}
  story_file = ss["story_file_rel"] || "_bmad-output/implementation-artifacts/story-#{story_id}.md"
  story_key = ss["story_key"] || resolve_story_key(project_root, story_id) || story_id
  worktree = ss["worktree_path"] || "../BidWise-story-#{story_id}"
  is_ui = ss["is_ui"]
  review_cycle = ss["review_cycle"] || 0
  artifacts_root = File.join(project_root, "_bmad-output", "implementation-artifacts")
  story_output_path = File.join(project_root, story_file)
  sprint_status_path = File.join(artifacts_root, "sprint-status.yaml")

  case phase
  when "create"
    <<~PAYLOAD
      Headless create-story worker task.
      Run `/bmad-create-story #{story_id}`.

      Mandatory headless inputs:
      - headless_worker_mode: true
      - story_id: #{story_id}
      - story_key: #{story_key}
      - output_path: #{story_output_path}
      - artifacts_root: #{artifacts_root}
      - sprint_status_path: #{sprint_status_path}

      Contract:
      - Do not auto-discover or auto-select any other story.
      - Do not ask follow-up questions.
      - If any mandatory input is missing or inconsistent, stop with reason token MISSING_INPUT.
      - Keep all writes under #{artifacts_root}.
      - Success result token: CREATED
    PAYLOAD
  when "prototype"
    <<~PAYLOAD
      Create a UI prototype for story #{story_id}.
      Story file: #{story_file}
      Use Pencil MCP tools to create the .pen file and export PNG.
      If required inputs are missing, stop with reason token MISSING_INPUT.
      Success result token: PROTOTYPED
    PAYLOAD
  when "validate"
    <<~PAYLOAD
      Validate story #{story_id} against acceptance criteria.
      Story file: #{story_file}
      Check: story completeness, acceptance criteria clarity, dependency correctness.
      Allowed result tokens: PASS or FAIL.
    PAYLOAD
  when "dev"
    ui_line = is_ui ? "\nThis is a UI story — also use frontend-design skill." : ""
    <<~PAYLOAD
      /bmad-dev-story #{story_file}#{ui_line}
      Success result token: REVIEW_READY
    PAYLOAD
  when "review"
    findings_cycle = review_cycle + 1
    findings_output = File.join(File.expand_path(project_root), "_bmad-output", "implementation-artifacts",
                                "review-findings-#{story_id}-cycle-#{findings_cycle}.md")
    <<~PAYLOAD
      /bmad-code-review
      Review story implementation against main in fresh context.
      Story id: #{story_id}
      Worktree: #{worktree}
      Review mode: branch diff vs main
      Spec file: #{story_file}
      Do not modify source files in the worktree; writing the review findings artifact is required.
      Write your review findings to: #{findings_output}
      Format:
      # Review Findings: #{story_id} (cycle #{findings_cycle})
      ## Verdict: PASS | FAIL
      ## Must-Fix Issues
      - [ ] issue description (file:line)
      ## Suggestions (non-blocking)
      - suggestion description
      Allowed result tokens: REVIEW_PASS or REVIEW_FAIL.
    PAYLOAD
  when "fixing"
    findings_file = File.join(File.expand_path(project_root), "_bmad-output", "implementation-artifacts",
                              "review-findings-#{story_id}-cycle-#{review_cycle}.md")
    <<~PAYLOAD
      Fix code review findings for story #{story_id}.
      Findings: #{findings_file}
      Worktree: #{worktree}
      Success result token: FIX_COMPLETE
    PAYLOAD
  when "qa"
    <<~PAYLOAD
      /bmad-qa-generate-e2e-tests
      Story: #{story_id}
      Worktree: #{worktree}
      Spec file: #{story_file}
      Run tests after generating.
      Allowed result tokens: QA_PASS or QA_FAIL.
    PAYLOAD
  when "regression"
    <<~PAYLOAD
      Run full regression tests after merge of story #{story_id}.
      Layer 1: pnpm test (unit + integration)
      Layer 2: pnpm lint
      Layer 3: pnpm build
      Allowed result tokens: PASS or FAIL.
    PAYLOAD
  when "noop"
    <<~PAYLOAD
      This is a dry-run runtime verification task for story #{story_id}.
      Do not create, modify, delete, or commit any project files.
      Do not run tests or build commands.
      Success result token: PASS
    PAYLOAD
  else
    "Unknown phase #{phase}. Stop with reason token INVALID_PHASE."
  end
end

def build_task_block(task_id, phase, story_id, payload)
  <<~TASK
    TASK #{task_id} #{phase.upcase} #{story_id}
    #{payload}
    END_TASK
  TASK
end

def wait_for_worker_ready(log_file, worker_id, timeout_sec: 90, start_pos: 0, boot_token_file: nil)
  wait_for_log_condition(log_file, timeout_sec: timeout_sec, start_pos: start_pos) do |text|
    token = boot_token_file ? parse_boot_token(boot_token_file) : {}
    status = token["status"].to_s
    next({"source" => "boot_token", "status" => status}) if status == "worker_ready"

    if text.include?("MC_STATE WORKER_READY")
      {"source" => "pane_log", "marker" => "MC_STATE WORKER_READY"}
    elsif text.include?("MC_WORKER_READY #{worker_id}")
      {"source" => "pane_log", "marker" => "MC_WORKER_READY #{worker_id}"}
    end
  end
end

def wait_for_task_ack(log_file, task_id, timeout_sec: 20, start_pos: 0)
  wait_for_log_condition(log_file, timeout_sec: timeout_sec, start_pos: start_pos) do |text|
    lines = text.lines.map(&:strip).reject(&:empty?)
    halt_line = lines.reverse.find { |line| line.match?(/^HALT(?:\s|$)/) }
    next({"result" => "halt", "line" => halt_line}) if halt_line

    ack_seen =
      text.match?(/MC_STATE TASK_ACKED(?:\s|$)/) ||
      text.match?(/MC_ACK\s+#{Regexp.escape(task_id)}(?:\s|$)/) ||
      text.match?(/MC_BEGIN\s+#{Regexp.escape(task_id)}(?:\s|$)/) ||
      text.match?(/MC_DONE\s+\S+\s+\S+\s+\S+(?:\s|$)/) ||
      text.match?(/HALT\s+#{Regexp.escape(task_id)}(?:\s|$)/)
    next nil unless ack_seen

    started_seen =
      text.match?(/MC_STATE TASK_STARTED(?:\s|$)/) ||
      text.match?(/MC_BEGIN\s+#{Regexp.escape(task_id)}(?:\s|$)/) ||
      text.match?(/MC_DONE\s+\S+\s+\S+\s+\S+(?:\s|$)/) ||
      text.match?(/HALT\s+#{Regexp.escape(task_id)}(?:\s|$)/)
    {"result" => "acked", "started" => started_seen}
  end
end

def send_task_to_worker(control_fifo, task_block)
  Timeout.timeout(5) do
    File.open(control_fifo, "w") do |f|
      f.write(task_block)
      f.flush
    end
  end
  true
rescue StandardError
  false
end

def ensure_pipe_logging(log_file, pane_id)
  FileUtils.mkdir_p(File.dirname(log_file))
  system("tmux", "pipe-pane", "-t", pane_id.to_s, "-o", "cat >> #{log_file}")
end

def ensure_protocol_worker(project_root:, expected_gen:, state:, session_name:, commander_pane:, bottom_anchor:,
                           story_id:, phase:, worker_role:, llm:, workdir:, fresh_pane:, trigger_seq:)
  title = worker_title_for(story_id, worker_role)
  worker_id = worker_id_for(story_id, worker_role)
  worker_dir = worker_runtime_dir(project_root, session_name, expected_gen, story_id, worker_role)
  control_fifo = worker_control_fifo(project_root, session_name, expected_gen, story_id, worker_role)
  boot_token_file = worker_boot_token_file(project_root, session_name, expected_gen, story_id, worker_role)
  bootstrap_file = worker_bootstrap_file(project_root, session_name, expected_gen, story_id, worker_role)
  pane_id = state.dig("panes", "stories", story_id, worker_role)
  log_file = pane_id ? runtime_pane_log_file(project_root, session_name, expected_gen, pane_id) : nil
  diag_log(project_root, "ensure_protocol_worker.begin", {
    "expected_generation" => expected_gen,
    "session_name" => session_name.to_s,
    "story_id" => story_id.to_s,
    "phase" => phase.to_s,
    "worker_role" => worker_role.to_s,
    "worker_id" => worker_id.to_s,
    "llm" => llm.to_s,
    "workdir" => workdir.to_s,
    "fresh_pane" => fresh_pane == true,
    "trigger_seq" => trigger_seq,
    "bottom_anchor" => bottom_anchor.to_s,
    "existing_pane_id" => pane_id.to_s,
    "registered_story_panes" => state.dig("panes", "stories", story_id),
    "panes" => pane_diag_snapshot(session_name),
  })

  if fresh_pane && pane_id && pane_alive?(session_name, pane_id)
    diag_log(project_root, "ensure_protocol_worker.fresh_pane_release", {
      "story_id" => story_id.to_s,
      "phase" => phase.to_s,
      "pane_id" => pane_id.to_s,
      "bottom_anchor" => bottom_anchor.to_s,
    })
    release_worker_pane(pane_id: pane_id, bottom_anchor: bottom_anchor)
    close_payload = {"story_id" => story_id, "role" => worker_role, "pane_id" => pane_id}
    event_bus("append", project_root, expected_gen.to_s, "PANE_CLOSED", "transition_engine", trigger_seq.to_s, JSON.generate(close_payload))
    pane_id = nil
  end

  1.upto(2) do
    if pane_id && wrapper_running?(session_name, pane_id, boot_token_file)
      log_file ||= runtime_pane_log_file(project_root, session_name, expected_gen, pane_id)
      ensure_pipe_logging(log_file, pane_id)
      token = parse_boot_token(boot_token_file)
      if token["status"] == "worker_ready" || pane_log_text(log_file).include?("MC_STATE WORKER_READY")
        diag_log(project_root, "ensure_protocol_worker.reuse_ready", {
          "story_id" => story_id.to_s,
          "phase" => phase.to_s,
          "pane_id" => pane_id.to_s,
          "worker_id" => worker_id.to_s,
          "boot_token_status" => token["status"].to_s,
        })
        return {"pane_id" => pane_id, "log_file" => log_file, "control_fifo" => control_fifo, "worker_id" => worker_id, "created" => false}
      end

      ready_result = wait_for_worker_ready(
        log_file,
        worker_id,
        timeout_sec: worker_reuse_ready_timeout_sec,
        start_pos: 0,
        boot_token_file: boot_token_file
      )
      diag_log(project_root, "ensure_protocol_worker.reuse_wait", {
        "story_id" => story_id.to_s,
        "phase" => phase.to_s,
        "pane_id" => pane_id.to_s,
        "worker_id" => worker_id.to_s,
        "ready" => !!ready_result,
        "ready_source" => ready_result.is_a?(Hash) ? ready_result["source"].to_s : "",
        "boot_token_status" => parse_boot_token(boot_token_file)["status"].to_s,
        "log_excerpt" => log_excerpt(pane_log_text(log_file)),
      })
      return {"pane_id" => pane_id, "log_file" => log_file, "control_fifo" => control_fifo, "worker_id" => worker_id, "created" => false} if ready_result

      diag_log(project_root, "ensure_protocol_worker.reuse_release", {
        "story_id" => story_id.to_s,
        "phase" => phase.to_s,
        "pane_id" => pane_id.to_s,
        "bottom_anchor" => bottom_anchor.to_s,
      })
      release_worker_pane(pane_id: pane_id, bottom_anchor: bottom_anchor)
      pane_id = nil
    end

    FileUtils.mkdir_p(worker_dir)
    File.delete(boot_token_file) if File.exist?(boot_token_file)
    File.write(bootstrap_file, build_worker_bootstrap(worker_role, story_id, worker_id))
    ensure_fifo(control_fifo)

    wrapper = File.join(SCRIPT_DIR, "agent-wrapper.py")
    agent_command = agent_command_for(llm)
    command_string = [
      "python3",
      Shellwords.escape(wrapper),
      "--agent-command", Shellwords.escape(agent_command),
      "--packet-file", Shellwords.escape(bootstrap_file.to_s),
      "--ready-timeout", "90",
      "--control-fifo", Shellwords.escape(control_fifo.to_s),
      "--boot-token-file", Shellwords.escape(boot_token_file.to_s),
      "--protocol-worker",
      "--worker-id", Shellwords.escape(worker_id),
      "--bootstrap-timeout", worker_bootstrap_timeout_sec.to_s,
      "--bootstrap-retries", worker_bootstrap_retries_count.to_s,
      "--ack-timeout", worker_ack_timeout_sec.to_s,
      "--begin-timeout", worker_begin_timeout_sec.to_s,
      "--long-lived",
    ].join(" ")

    tmux_layout = File.join(SCRIPT_DIR, "tmux-layout.sh")
    diag_env = {
      "MC_DIAG_LOG_PATH" => diag_log_path(project_root).to_s,
      "MC_DIAG_SESSION" => session_name.to_s,
      "MC_DIAG_STORY_ID" => story_id.to_s,
      "MC_DIAG_PHASE" => phase.to_s,
      "MC_DIAG_WORKER_ID" => worker_id.to_s,
    }
    stdout, stderr, status = Open3.capture3(
      diag_env,
      tmux_layout, "open-worker",
      session_name, commander_pane.to_s, bottom_anchor.to_s,
      title, workdir, command_string
    )
    diag_log(project_root, "ensure_protocol_worker.open_worker", {
      "story_id" => story_id.to_s,
      "phase" => phase.to_s,
      "worker_role" => worker_role.to_s,
      "bottom_anchor" => bottom_anchor.to_s,
      "stdout" => stdout.strip,
      "stderr" => stderr.strip,
      "exit_status" => status.exitstatus,
      "panes_after" => pane_diag_snapshot(session_name),
    })
    die("tmux-layout.sh open-worker failed: #{stderr.strip.empty? ? stdout.strip : stderr.strip}") unless status.success?

    raw_output = stdout.strip
    pane_reused = raw_output.start_with?("REUSED:")
    pane_id = raw_output.sub(/\A(REUSED|CREATED):/, "")
    log_file = runtime_pane_log_file(project_root, session_name, expected_gen, pane_id)

    if pane_reused
      # Reused pane found by tmux title — verify wrapper health without deleting boot_token
      ensure_pipe_logging(log_file, pane_id)
      if wrapper_running?(session_name, pane_id, boot_token_file)
        token = parse_boot_token(boot_token_file)
        if token["status"] == "worker_ready" || pane_log_text(log_file).include?("MC_STATE WORKER_READY")
          diag_log(project_root, "ensure_protocol_worker.reused_pane_ready", {
            "story_id" => story_id.to_s,
            "phase" => phase.to_s,
            "pane_id" => pane_id.to_s,
            "worker_id" => worker_id.to_s,
            "boot_token_status" => token["status"].to_s,
          })
          return {"pane_id" => pane_id, "log_file" => log_file, "control_fifo" => control_fifo, "worker_id" => worker_id, "created" => false}
        end
        ready_result = wait_for_worker_ready(
          log_file,
          worker_id,
          timeout_sec: worker_reuse_ready_timeout_sec,
          start_pos: 0,
          boot_token_file: boot_token_file
        )
        diag_log(project_root, "ensure_protocol_worker.reused_pane_wait", {
          "story_id" => story_id.to_s,
          "phase" => phase.to_s,
          "pane_id" => pane_id.to_s,
          "worker_id" => worker_id.to_s,
          "ready" => !!ready_result,
          "ready_source" => ready_result.is_a?(Hash) ? ready_result["source"].to_s : "",
          "boot_token_status" => parse_boot_token(boot_token_file)["status"].to_s,
          "log_excerpt" => log_excerpt(pane_log_text(log_file)),
        })
        return {"pane_id" => pane_id, "log_file" => log_file, "control_fifo" => control_fifo, "worker_id" => worker_id, "created" => false} if ready_result
      end
      # Reused pane is not usable — kill and retry next iteration
      diag_log(project_root, "ensure_protocol_worker.reused_pane_release", {
        "story_id" => story_id.to_s,
        "phase" => phase.to_s,
        "pane_id" => pane_id.to_s,
        "bottom_anchor" => bottom_anchor.to_s,
      })
      release_worker_pane(pane_id: pane_id, bottom_anchor: bottom_anchor)
      pane_id = nil
    else
      # New pane — clean slate: truncate any stale log and wait for ready.
      File.truncate(log_file, 0) if File.exist?(log_file)
      ensure_pipe_logging(log_file, pane_id)
      ready_result = wait_for_worker_ready(
        log_file,
        worker_id,
        timeout_sec: worker_ready_timeout_sec,
        start_pos: 0,
        boot_token_file: boot_token_file
      )
      diag_log(project_root, "ensure_protocol_worker.new_pane_wait", {
        "story_id" => story_id.to_s,
        "phase" => phase.to_s,
        "pane_id" => pane_id.to_s,
        "worker_id" => worker_id.to_s,
        "ready" => !!ready_result,
        "ready_source" => ready_result.is_a?(Hash) ? ready_result["source"].to_s : "",
        "boot_token_status" => parse_boot_token(boot_token_file)["status"].to_s,
        "log_excerpt" => log_excerpt(pane_log_text(log_file)),
      })
      return {"pane_id" => pane_id, "log_file" => log_file, "control_fifo" => control_fifo, "worker_id" => worker_id, "created" => true} if ready_result
      diag_log(project_root, "ensure_protocol_worker.new_pane_release", {
        "story_id" => story_id.to_s,
        "phase" => phase.to_s,
        "pane_id" => pane_id.to_s,
        "bottom_anchor" => bottom_anchor.to_s,
      })
      release_worker_pane(pane_id: pane_id, bottom_anchor: bottom_anchor)
      pane_id = nil
    end
  end

  diag_log(project_root, "ensure_protocol_worker.boot_timeout", {
    "story_id" => story_id.to_s,
    "phase" => phase.to_s,
    "worker_role" => worker_role.to_s,
    "worker_id" => worker_id.to_s,
    "bottom_anchor" => bottom_anchor.to_s,
    "panes_after" => pane_diag_snapshot(session_name),
  })
  die("WORKER_BOOT_TIMEOUT: #{story_id} #{phase}")
end

def append_dispatch_state(project_root, expected_gen, trigger_seq, story_id, pane_id, dispatch_state)
  payload = {
    "story_id" => story_id,
    "pane_id" => pane_id,
    "dispatch_state" => dispatch_state,
  }
  event_bus("append", project_root, expected_gen.to_s, "DISPATCH_STATE_CHANGED",
            "transition_engine", trigger_seq.to_s, JSON.generate(payload))
end

def cmd_dispatch(project_root, expected_gen, story_id, phase, trigger_seq, opts = {})
  # 1. Dedup: check if already dispatched for this trigger-seq
  existing = find_event_in_log(project_root, "TASK_DISPATCHED", trigger_seq, story_id, phase)
  if existing
    pane_id = existing.dig("payload", "pane_id")
    stdout, _, st = Open3.capture3("tmux", "list-panes", "-s", "-F", '#{pane_id}')
    if st.success? && stdout.include?(pane_id.to_s)
      puts JSON.generate({"success" => true, "already_applied" => true, "pane_id" => pane_id})
      return
    else
      die("PANE_DEAD_AFTER_DISPATCH: pane #{pane_id} is gone. Use HEALTH rebuild_pane or new DISPATCH with new trigger-seq.")
    end
  end

  # 2. Determine LLM + auto-escalation for fixing phase (design doc §3.2.1 Fix Cycle Pane Strategy)
  override_llm = opts[:override_llm]
  override_reason = opts[:override_reason]
  fresh_pane = opts[:fresh_pane]

  # Read story state for cycle-based auto-escalation
  pre_state = load_gate_state(project_root)
  ss_pre = pre_state.dig("story_states", story_id) || {}
  review_cycle = ss_pre["review_cycle"] || 0

  if phase == "fixing" && review_cycle >= 2 && !override_llm
    # Cycle 3+ (0-indexed cycle 2): force codex + fresh pane (design doc line 448)
    override_llm = "codex"
    override_reason ||= "auto_escalation_cycle_#{review_cycle + 1}"
    fresh_pane = true
  end

  llm = override_llm || LLM_FOR_PHASE[phase] || "claude"
  c2_override = !override_llm.nil?
  worker_role = worker_role_for_dispatch(phase, fresh_pane: !!fresh_pane)

  # 3. Validate FSM transition up front, but do not commit it until dispatch is durable.
  intent = DISPATCH_INTENT_MAP[phase]
  transition_plan = nil
  if intent
    current_state = load_gate_state(project_root)
    config = current_state["config"] || DEFAULT_CONFIG
    current_phase = current_state.dig("story_states", story_id, "phase").to_s
    unless current_phase == DISPATCH_TARGET_PHASE[phase]
      transition_plan = prepare_transition_commit(
        project_root,
        current_state,
        story_id,
        intent,
        config,
        "current_llm" => llm,
        "dispatch_state" => "worker_ready",
        "c2_override" => c2_override
      )
    end
  end

  # 4. Resolve session context
  state = load_gate_state(project_root)
  session_name = state["session_name"]
  commander_pane = state["commander_pane"]
  bottom_anchor = state["bottom_anchor"]
  inspector_pane = state.dig("panes", "inspector")
  utility_pane = state.dig("panes", "utility")
  diag_log(project_root, "dispatch.context_loaded", {
    "expected_generation" => expected_gen,
    "story_id" => story_id.to_s,
    "phase" => phase.to_s,
    "session_name" => session_name.to_s,
    "commander_pane" => commander_pane.to_s,
    "inspector_pane" => inspector_pane.to_s,
    "utility_pane" => utility_pane.to_s,
    "bottom_anchor" => bottom_anchor.to_s,
    "story_state" => state.dig("story_states", story_id),
  })
  unless session_name && commander_pane && bottom_anchor
    session_name ||= `tmux display-message -p '\#{session_name}' 2>/dev/null`.strip
    commander_pane ||= `tmux display-message -p '\#{pane_id}' 2>/dev/null`.strip
    bottom_anchor ||= `tmux list-panes -t "#{session_name}" -F '\#{pane_id} \#{pane_title}' 2>/dev/null`.lines
      .find { |l| l.include?("mc-bottom-anchor") }&.split&.first&.strip
    die("cannot resolve session context") unless session_name && !session_name.empty?
  end
  bottom_anchor = ensure_live_bottom_anchor(
    project_root: project_root,
    expected_gen: expected_gen,
    session_name: session_name,
    commander_pane: commander_pane,
    inspector_pane: inspector_pane,
    utility_pane: utility_pane,
    current_bottom_anchor: bottom_anchor
  )

  # 5. Determine workdir
  ss = state.dig("story_states", story_id) || {}
  workdir = if %w[dev fixing review qa regression].include?(phase)
    wt = ss["worktree_path"] || "../BidWise-story-#{story_id}"
    File.expand_path(wt, project_root)
  else
    File.expand_path(project_root)
  end

  # 6. Ensure resident worker and protocol readiness
  worker = ensure_protocol_worker(
    project_root: project_root,
    expected_gen: expected_gen,
    state: state,
    session_name: session_name,
    commander_pane: commander_pane,
    bottom_anchor: bottom_anchor,
    story_id: story_id,
    phase: phase,
    worker_role: worker_role,
    llm: llm,
    workdir: workdir,
    fresh_pane: fresh_pane,
    trigger_seq: trigger_seq
  )
  pane_id = worker.fetch("pane_id")
  log_file = worker.fetch("log_file")
  boot_token_file = worker_boot_token_file(project_root, session_name, expected_gen, story_id, worker_role)
  task_id = "#{story_id}-#{phase}-#{trigger_seq}".gsub(/[^A-Za-z0-9._:-]/, "_")
  task_payload = build_task_payload(phase, story_id, project_root, state, opts)
  task_block = build_task_block(task_id, phase, story_id, task_payload)

  # 7. Persist TASK_DISPATCHED / PANE_REGISTERED before enqueueing work
  dispatch_payload = {
    "story_id" => story_id,
    "phase" => phase,
    "llm" => llm,
    "pane_id" => pane_id,
    "task_id" => task_id,
    "worker_id" => worker["worker_id"],
    "c2_override" => c2_override,
    "override_reason" => override_reason,
    "constitution_check" => "PASS",
    "dispatch_state" => "worker_ready",
  }
  event_bus("append", project_root, expected_gen.to_s, "TASK_DISPATCHED",
            "transition_engine", trigger_seq.to_s, JSON.generate(dispatch_payload))

  if worker["created"]
    pane_payload = {
      "story_id" => story_id,
      "role" => worker_role,
      "pane_id" => pane_id,
      "title" => worker_title_for(story_id, worker_role),
    }
    event_bus("append", project_root, expected_gen.to_s, "PANE_REGISTERED",
              "transition_engine", trigger_seq.to_s, JSON.generate(pane_payload))
  end
  append_dispatch_state(project_root, expected_gen, trigger_seq, story_id, pane_id, "worker_ready")

  if transition_plan
    append_story_phase_changed(
      project_root,
      expected_gen,
      story_id,
      intent,
      transition_plan.fetch("current_phase"),
      transition_plan.fetch("target"),
      trigger_seq
    )
  end

  event_bus("materialize", project_root)

  # 8. Enqueue task through the worker FIFO and require protocol ACK before success.
  send_start_pos = pane_log_size(log_file)
  diag_log(project_root, "dispatch.task_send.begin", {
    "story_id" => story_id.to_s,
    "phase" => phase.to_s,
    "pane_id" => pane_id.to_s,
    "task_id" => task_id.to_s,
    "worker_id" => worker["worker_id"].to_s,
    "log_file" => log_file.to_s,
    "send_start_pos" => send_start_pos,
    "boot_token" => task_ack_boot_snapshot(boot_token_file),
    "task_block_excerpt" => log_excerpt(task_block, max_lines: 18, max_chars: 1600),
  })
  unless send_task_to_worker(worker.fetch("control_fifo"), task_block)
    diag_log(project_root, "dispatch.task_send.failed", {
      "story_id" => story_id.to_s,
      "phase" => phase.to_s,
      "pane_id" => pane_id.to_s,
      "task_id" => task_id.to_s,
      "worker_id" => worker["worker_id"].to_s,
      "control_fifo" => worker.fetch("control_fifo").to_s,
      "boot_token" => task_ack_boot_snapshot(boot_token_file),
    })
    die("TASK_QUEUE_SEND_FAILED: #{story_id} #{phase}")
  end
  diag_log(project_root, "dispatch.task_send.complete", {
    "story_id" => story_id.to_s,
    "phase" => phase.to_s,
    "pane_id" => pane_id.to_s,
    "task_id" => task_id.to_s,
    "worker_id" => worker["worker_id"].to_s,
    "log_size_after_send" => pane_log_size(log_file),
    "boot_token" => task_ack_boot_snapshot(boot_token_file),
  })

  ack_result = wait_for_task_ack(log_file, task_id, timeout_sec: 20, start_pos: send_start_pos)
  if ack_result.nil?
    diag_log(project_root, "dispatch.task_ack.timeout", {
      "story_id" => story_id.to_s,
      "phase" => phase.to_s,
      "pane_id" => pane_id.to_s,
      "task_id" => task_id.to_s,
      "worker_id" => worker["worker_id"].to_s,
      "send_start_pos" => send_start_pos,
      "log_size_at_timeout" => pane_log_size(log_file),
      "boot_token" => task_ack_boot_snapshot(boot_token_file),
      "log_excerpt" => log_excerpt(pane_log_text(log_file), max_lines: 40, max_chars: 2400),
    })
    die("TASK_ACK_TIMEOUT: #{story_id} #{phase} #{task_id}")
  end
  diag_log(project_root, "dispatch.task_ack.result", {
    "story_id" => story_id.to_s,
    "phase" => phase.to_s,
    "pane_id" => pane_id.to_s,
    "task_id" => task_id.to_s,
    "worker_id" => worker["worker_id"].to_s,
    "ack_result" => ack_result,
    "log_size_after_ack" => pane_log_size(log_file),
    "boot_token" => task_ack_boot_snapshot(boot_token_file),
    "log_excerpt" => log_excerpt(pane_log_text(log_file), max_lines: 40, max_chars: 2400),
  })
  if ack_result["result"] == "halt"
    die("TASK_ACK_REJECTED: #{ack_result["line"]}")
  end

  append_dispatch_state(project_root, expected_gen, trigger_seq, story_id, pane_id, "task_acked")
  append_dispatch_state(project_root, expected_gen, trigger_seq, story_id, pane_id, "task_started") if ack_result["started"]
  write_task_monitor_log_cursor(project_root, session_name, expected_gen, pane_id, pane_log_size(log_file))

  # 9. Materialize
  event_bus("materialize", project_root)

  puts JSON.generate({
    "success" => true,
    "story_id" => story_id,
    "phase" => phase,
    "pane_id" => pane_id,
    "llm" => llm,
    "c2_override" => c2_override,
    "task_id" => task_id,
    "worker_id" => worker["worker_id"],
  })
end

# ─── Available Transitions ───────────────────────────────────────────────────

def cmd_available(project_root, story_id)
  state = load_gate_state(project_root)
  ss = state.dig("story_states", story_id)
  die("unknown story: #{story_id}") unless ss

  current_phase = ss["phase"] || "queued"
  available = ALL_TRANSITIONS.keys
    .select { |from, _| from == current_phase }
    .map { |_, intent| intent }

  puts JSON.generate({
    "success" => true,
    "story_id" => story_id,
    "current_phase" => current_phase,
    "available_intents" => available,
  })
end

# ─── Validate All Invariants ─────────────────────────────────────────────────

def cmd_validate(project_root)
  state = load_gate_state(project_root)
  config = state["config"] || DEFAULT_CONFIG
  all_errors = {}

  (state["story_states"] || {}).each do |story_id, ss|
    errors = check_invariants(ss, story_id, config)
    all_errors[story_id] = errors unless errors.empty?
  end

  # Gate chain invariants
  (state["story_gates"] || {}).each do |story_id, gates|
    g8 = gates.dig("G8", "status") == "PASS"
    g7 = gates.dig("G7", "status") == "PASS"
    g9 = gates.dig("G9", "status") == "PASS"
    g10 = gates.dig("G10", "status") == "PASS"
    g11 = gates.dig("G11", "status") == "PASS"

    chain_errors = []
    chain_errors << "gate_chain_g8: G8 without G7" if g8 && !g7
    chain_errors << "gate_chain_g9: G9 without G8" if g9 && !g8
    chain_errors << "gate_chain_g10: G10 without G7+G8+G9" if g10 && !(g7 && g8 && g9)
    chain_errors << "gate_chain_g11: G11 without G10" if g11 && !g10

    all_errors[story_id] = (all_errors[story_id] || []) + chain_errors unless chain_errors.empty?
  end

  puts JSON.generate({
    "success" => all_errors.empty?,
    "errors" => all_errors,
  })
end

# ─── Batch Transition ────────────────────────────────────────────────────────

def cmd_batch_transition(project_root, expected_gen, intent, story_csv, trigger_seq)
  stories = story_csv.split(",").map(&:strip)
  state = load_gate_state(project_root)
  config = state["config"] || DEFAULT_CONFIG

  # Pre-check all stories
  stories.each do |sid|
    ss = state.dig("story_states", sid)
    die("unknown story in batch: #{sid}") unless ss
    current_phase = ss["phase"] || "queued"
    transition = ALL_TRANSITIONS[[current_phase, intent]]
    die("INVALID_TRANSITION: no transition from '#{current_phase}' via '#{intent}' for #{sid}") unless transition

    transition[:preconditions].each do |precond|
      unless evaluate_precondition(precond, project_root, state, sid, config)
        die("PRECONDITION_FAILED: #{precond} for story #{sid}")
      end
    end
  end

  # Execute all
  results = stories.map do |sid|
    cmd_execute(project_root, expected_gen, sid, intent, trigger_seq)
  end

  # Output already handled by cmd_execute per story
end

# ─── Argument Parsing ────────────────────────────────────────────────────────

def parse_flags(args)
  opts = {}
  i = 0
  while i < args.length
    case args[i]
    when "--trigger-seq"
      opts[:trigger_seq] = Integer(args[i + 1])
      i += 2
    when "--override-llm"
      opts[:override_llm] = args[i + 1]
      i += 2
    when "--override-reason"
      opts[:override_reason] = args[i + 1]
      i += 2
    when "--fresh-pane"
      opts[:fresh_pane] = true
      i += 1
    else
      i += 1
    end
  end
  opts
end

# ─── Command Dispatch ────────────────────────────────────────────────────────

cmd = ARGV.shift or die("missing command")

case cmd
when "execute"
  die("usage: execute <project_root> <expected_gen> <story_id> <intent> --trigger-seq <N>") unless ARGV.length >= 4
  project_root = ARGV[0]
  expected_gen = Integer(ARGV[1])
  story_id = ARGV[2]
  intent = ARGV[3]
  opts = parse_flags(ARGV[4..] || [])
  trigger_seq = opts[:trigger_seq] or die("--trigger-seq required")
  cmd_execute(project_root, expected_gen, story_id, intent, trigger_seq)

when "dispatch"
  die("usage: dispatch <project_root> <expected_gen> <story_id> <phase> --trigger-seq <N> [flags]") unless ARGV.length >= 4
  project_root = ARGV[0]
  expected_gen = Integer(ARGV[1])
  story_id = ARGV[2]
  phase = ARGV[3]
  opts = parse_flags(ARGV[4..] || [])
  trigger_seq = opts[:trigger_seq] or die("--trigger-seq required")
  cmd_dispatch(project_root, expected_gen, story_id, phase, trigger_seq, opts)

when "available"
  die("usage: available <project_root> <story_id>") unless ARGV.length == 2
  cmd_available(ARGV[0], ARGV[1])

when "validate"
  die("usage: validate <project_root>") unless ARGV.length == 1
  cmd_validate(ARGV[0])

when "batch-transition"
  die("usage: batch-transition <project_root> <expected_gen> <intent> <story_csv> --trigger-seq <N>") unless ARGV.length >= 4
  project_root = ARGV[0]
  expected_gen = Integer(ARGV[1])
  intent = ARGV[2]
  story_csv = ARGV[3]
  opts = parse_flags(ARGV[4..] || [])
  trigger_seq = opts[:trigger_seq] or die("--trigger-seq required")
  cmd_batch_transition(project_root, expected_gen, intent, story_csv, trigger_seq)

else
  die("unknown command: #{cmd}. Valid: execute, dispatch, available, validate, batch-transition")
end
RUBY
