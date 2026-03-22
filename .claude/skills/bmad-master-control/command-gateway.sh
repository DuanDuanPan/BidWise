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
require "fileutils"
require "tempfile"
require "shellwords"
require "time"
require "timeout"

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
  create prototype validate dev review fixing qa regression noop
]).freeze

VALID_HEALTH_ACTIONS = Set.new(%w[
  check_inspector ensure_inspector ensure_runtime restart_watchdog rebuild_pane check_logging
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

def runtime_dir(project_root, session_name, generation)
  File.join(project_root, "_bmad-output", "implementation-artifacts", "runtime", "#{session_name}-g#{generation}")
end

def runtime_mc_logs_dir(project_root, session_name, generation)
  File.join(runtime_dir(project_root, session_name, generation), "mc-logs")
end

def runtime_pane_log_file(project_root, session_name, generation, pane_id)
  File.join(runtime_mc_logs_dir(project_root, session_name, generation), "pane-#{pane_id.to_s.delete('%')}.log")
end

def runtime_consumer_name(project_root, expected_gen, base = "commander")
  gs_path = File.join(project_root, "_bmad-output", "implementation-artifacts", "gate-state.yaml")
  gs = File.exist?(gs_path) ? (YAML.safe_load(File.read(gs_path)) rescue {}) : {}
  session_name = gs["session_name"] || `tmux display-message -p '\#{session_name}' 2>/dev/null`.strip rescue "unknown"
  safe_session = session_name.to_s.gsub(/[^A-Za-z0-9._-]/, "_")
  "#{base}-#{safe_session}-g#{expected_gen}"
end

def script_path(name)
  File.join(SCRIPT_DIR, name)
end

def shell_script?(path)
  File.extname(path) == ".sh"
end

def run_script(name, *args)
  path = script_path(name)
  cmd = shell_script?(path) ? ["bash", path] : [path]
  cmd += args.map(&:to_s)
  stdout, stderr, status = Open3.capture3(*cmd)
  unless status.success?
    error_msg = stderr.strip.empty? ? stdout.strip : stderr.strip
    die("#{name} failed: #{error_msg}")
  end
  stdout.strip
end

def run_local_script(path, *args)
  cmd = shell_script?(path) ? ["bash", path] : [path]
  cmd += args.map(&:to_s)
  stdout, stderr, status = Open3.capture3(*cmd)
  unless status.success?
    error_msg = stderr.strip.empty? ? stdout.strip : stderr.strip
    die("#{File.basename(path)} failed: #{error_msg}")
  end
  stdout.strip
end

def clean_terminal_output(text)
  text.to_s
    .dup
    .force_encoding(Encoding::UTF_8)
    .scrub
    .gsub(/\e\[[0-9;]*[[:alpha:]]/, "")
    .gsub(/\e\][^\a]*\a/, "")
    .gsub(/\r/, "\n")
end

def command_matches?(actual, expected)
  actual_name = actual.to_s.strip
  expected_name = expected.to_s.strip
  return false if actual_name.empty? || expected_name.empty?
  actual_name == expected_name || actual_name.start_with?("#{expected_name}-") || actual_name.include?(expected_name)
end

def capture_pane_text(pane_id, lines = 120)
  stdout, = Open3.capture2("tmux", "capture-pane", "-t", pane_id.to_s, "-p", "-S", "-#{lines}")
  clean_terminal_output(stdout)
rescue StandardError
  ""
end

def wait_for_pane_pattern(pane_id, pattern, timeout_sec: 30, lines: 120)
  deadline = Time.now + timeout_sec
  loop do
    text = capture_pane_text(pane_id, lines)
    return true if text.match?(pattern)
    return false if Time.now >= deadline
    sleep 1
  end
end

def wait_for_pane_command(pane_id, expected, timeout_sec: 30)
  deadline = Time.now + timeout_sec
  loop do
    current_cmd = `tmux display-message -p -t "#{pane_id}" '\#{pane_current_command}' 2>/dev/null`.strip rescue ""
    return true if command_matches?(current_cmd, expected)
    return false if Time.now >= deadline
    sleep 1
  end
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

def wait_for_log_pattern(log_file, pattern, timeout_sec: 30, start_pos: 0)
  deadline = Time.now + timeout_sec
  loop do
    if File.exist?(log_file)
      raw = File.binread(log_file)
      chunk = raw.byteslice(start_pos, raw.bytesize - start_pos) || "".b
      return true if clean_terminal_output(chunk).match?(pattern)
    end
    return false if Time.now >= deadline
    sleep 1
  end
end

def wait_for_log_substrings(log_file, substrings, timeout_sec: 30, start_pos: 0)
  deadline = Time.now + timeout_sec
  expected = Array(substrings)
  loop do
    if File.exist?(log_file)
      raw = File.binread(log_file)
      chunk = raw.byteslice(start_pos, raw.bytesize - start_pos) || "".b
      text = clean_terminal_output(chunk)
      return true if expected.any? { |needle| text.include?(needle) }
    end
    return false if Time.now >= deadline
    sleep 1
  end
end

def inspector_boot_output_seen?(text)
  text.include?("OpenAI Codex") || text.include?("Starting MCP servers")
end

def inspector_input_ready_seen?(text)
  normalized = clean_terminal_output(text)
  return true if normalized.match?(/gpt-[^\n]{0,80}·\s*100%\s*/m)
  return true if normalized.include?("Implement {feature}")
  return true if normalized.include?("Run /review on my current changes")
  return true if normalized.include?("Describe the task")
  false
end

def paste_block_to_pane(pane_id, text, buffer_prefix, submit_key: "Enter", post_paste_delay: 0.2)
  buffer_name = "#{buffer_prefix}-#{$$}"
  Tempfile.create([buffer_prefix, ".txt"]) do |tmp|
    tmp.write(text.end_with?("\n") ? text : "#{text}\n")
    tmp.flush
    system("tmux", "load-buffer", "-b", buffer_name, tmp.path)
  end
  system("tmux", "paste-buffer", "-b", buffer_name, "-t", pane_id.to_s)
  sleep post_paste_delay if post_paste_delay.to_f > 0
  system("tmux", "send-keys", "-t", pane_id.to_s, submit_key)
ensure
  system("tmux", "delete-buffer", "-b", buffer_name.to_s, [:out, :err] => "/dev/null")
end

def ensure_pipe_logging(project_root, session_name, generation, pane_id)
  log_dir = runtime_mc_logs_dir(project_root, session_name, generation)
  FileUtils.mkdir_p(log_dir)
  log_file = File.join(log_dir, "pane-#{pane_id.delete('%')}.log")
  system("tmux", "pipe-pane", "-t", pane_id.to_s, "-o", "cat >> #{log_file}")
end

def list_session_panes(session_name)
  `tmux list-panes -t "#{session_name}" -F '\#{pane_id}\t\#{pane_top}\t\#{pane_left}\t\#{pane_title}' 2>/dev/null`.lines.map do |line|
    pane_id, top, left, title = line.chomp.split("\t", 4)
    {"pane_id" => pane_id, "top" => top.to_i, "left" => left.to_i, "title" => title.to_s}
  end
end

def bootstrap_layout(session_name)
  panes = list_session_panes(session_name)
  die("cannot bootstrap empty tmux session '#{session_name}'") if panes.empty?

  commander_pane = panes.select { |p| p["top"] == 0 }.sort_by { |p| p["left"] }.first&.dig("pane_id") || panes.first["pane_id"]
  unless panes.any? { |p| p["top"] > 0 }
    bottom_anchor = `tmux split-window -t "#{commander_pane}" -v -l 40% -P -F '\#{pane_id}' 2>/dev/null`.strip
    unless bottom_anchor.empty?
      system("tmux", "select-pane", "-t", bottom_anchor, "-T", "mc-bottom-anchor")
      system("tmux", "set-option", "-p", "-t", bottom_anchor, "allow-rename", "off")
    end
  end

  panes = list_session_panes(session_name)
  top_panes = panes.select { |p| p["top"] == 0 }.sort_by { |p| p["left"] }
  if top_panes.length == 1
    `tmux split-window -t "#{top_panes[0]["pane_id"]}" -h -l 55% -P -F '\#{pane_id}' 2>/dev/null`.strip
  end

  panes = list_session_panes(session_name)
  top_panes = panes.select { |p| p["top"] == 0 }.sort_by { |p| p["left"] }
  if top_panes.length == 2
    `tmux split-window -t "#{top_panes[1]["pane_id"]}" -h -l 45% -P -F '\#{pane_id}' 2>/dev/null`.strip
  end
end

def resolve_layout_context(session_name)
  panes = list_session_panes(session_name)
  die("cannot inspect panes for session '#{session_name}'") if panes.empty?

  top_panes = panes.select { |p| p["top"] == 0 }.sort_by { |p| p["left"] }
  if top_panes.length < 3 || !panes.any? { |p| p["top"] > 0 }
    bootstrap_layout(session_name)
    panes = list_session_panes(session_name)
    top_panes = panes.select { |p| p["top"] == 0 }.sort_by { |p| p["left"] }
  end
  die("expected 3 top panes in session '#{session_name}', found #{top_panes.length}") if top_panes.length < 3

  commander_pane = top_panes[0]["pane_id"]
  inspector_pane = top_panes[1]["pane_id"]
  utility_pane = top_panes[2]["pane_id"]
  run_script("tmux-layout.sh", "set-top-titles", commander_pane, inspector_pane, utility_pane)

  bottom_anchor = panes
    .select { |p| p["top"] > 0 }
    .sort_by { |p| [p["left"], p["top"]] }
    .find { |p| p["title"] == "mc-bottom-anchor" }&.dig("pane_id")

  bottom_anchor ||= panes
    .select { |p| p["top"] > 0 }
    .sort_by { |p| [p["left"], p["top"]] }
    .find { |p| p["left"] == 0 }&.dig("pane_id")

  unless bottom_anchor.to_s.empty?
    system("tmux", "select-pane", "-t", bottom_anchor.to_s, "-T", "mc-bottom-anchor")
    system("tmux", "set-option", "-p", "-t", bottom_anchor.to_s, "allow-rename", "off")
  end

  {
    "session_name" => session_name,
    "commander_pane" => commander_pane,
    "inspector_pane" => inspector_pane,
    "utility_pane" => utility_pane,
    "bottom_anchor" => bottom_anchor.to_s,
  }
end

def inspector_standing_order(batch_id, stories, current_phase)
  protocol = File.read(script_path("inspector-protocol.md"))
  section = protocol.split("## 驻场令（首条消息）", 2).last
  die("failed to locate inspector standing order") unless section
  block = section[/```(.*?)```/m, 1]
  die("failed to extract inspector standing order block") unless block
  block
    .gsub("{batch_id}", batch_id.to_s)
    .gsub("{stories}", Array(stories).join(","))
    .gsub("{phase}", current_phase.to_s)
end

def inspector_bootstrap_message
  <<~MSG
    You are about to become the resident batch inspector.
    First, reply with exactly the two-word phrase formed by reversing these words:
    READY INSPECTOR
    After that, wait for my next message.
  MSG
end

def ensure_inspector_ready(project_root, context, batch_id:, stories:, current_phase:)
  inspector_pane = context.fetch("inspector_pane")
  session_name = context.fetch("session_name")
  generation = read_generation_lock(project_root)
  rt_dir = runtime_dir(project_root, session_name, generation)
  FileUtils.mkdir_p(rt_dir)
  log_file = runtime_pane_log_file(project_root, session_name, generation, inspector_pane)
  ensure_pipe_logging(project_root, session_name, generation, inspector_pane)

  pane_cmd = `tmux display-message -p -t "#{inspector_pane}" '\#{pane_current_command}' 2>/dev/null`.strip rescue ""

  # ── Branch A: wrapper 运行中 ──
  if wrapper_running?(rt_dir, inspector_pane)
    unless inspector_ready_from_log?(project_root, session_name, generation, inspector_pane)
      ready = wait_for_log_substrings(log_file,
        ["MC_STATE INSPECTOR_READY", "INSPECTOR READY", "BASELINE AUDIT:"], timeout_sec: 60)
      die("INSPECTOR_PROTOCOL_TIMEOUT") unless ready
    end
    marker = inspector_marker_path(rt_dir)
    die("INSPECTOR_BOOT_TOKEN_MISSING: cannot resolve marker path") unless marker
    ok = send_standing_order_via_fifo(rt_dir, marker, batch_id, stories, current_phase)
    die("INSPECTOR_STANDING_ORDER_FAILED: FIFO send failed for wrapper inspector") unless ok
    return context.merge("inspector_status" => "ready", "inspector_mode" => "wrapper")
  end

  # ── Branch B: 旧模式（直接 codex） ──
  if command_matches?(pane_cmd, "codex")
    unless inspector_ready_from_log?(project_root, session_name, generation, inspector_pane)
      ready = wait_for_log_substrings(log_file,
        ["INSPECTOR READY", "BASELINE AUDIT:"], timeout_sec: 30)
      die("INSPECTOR_PROTOCOL_TIMEOUT") unless ready
    end
    marker = legacy_marker_path(rt_dir, log_file)
    if marker.nil?
      # No INSPECTOR READY token in log — kill and fall through to Branch C on next call
      system("tmux", "send-keys", "-t", inspector_pane, "C-c")
      sleep 0.5
      die("LEGACY_INSPECTOR_NO_TOKEN: no INSPECTOR READY found in log, restart required")
    end
    unless File.exist?(marker)
      paste_block_to_pane(
        inspector_pane,
        inspector_standing_order(batch_id, stories, current_phase),
        "mc-inspector-standing-order",
        submit_key: "Tab"
      )
      File.write(marker, Time.now.utc.iso8601)
    end
    return context.merge("inspector_status" => "ready", "inspector_mode" => "legacy")
  end

  # ── Branch C: 全新启动 ──
  system("tmux", "send-keys", "-t", inspector_pane, "C-c")
  sleep 0.5

  # Clear stale boot token so wrapper_running? returns false during startup
  stale_token = inspector_boot_token_path(rt_dir)
  File.delete(stale_token) if File.exist?(stale_token)

  packet_file = File.join(rt_dir, "inspector-bootstrap-packet.txt")
  File.write(packet_file, inspector_bootstrap_message)

  control_fifo = File.join(rt_dir, "inspector-control.fifo")
  system("mkfifo", control_fifo) unless File.exist?(control_fifo)

  boot_token_file = inspector_boot_token_path(rt_dir)
  wrapper = File.join(SCRIPT_DIR, "agent-wrapper.py")
  launch_cmd = [
    "cd #{Shellwords.escape(project_root)} &&",
    "python3 #{Shellwords.escape(wrapper)}",
    "--agent-command #{Shellwords.escape("codex --no-alt-screen --search --dangerously-bypass-approvals-and-sandbox")}",
    "--packet-file #{Shellwords.escape(packet_file)}",
    "--ready-timeout 90",
    "--control-fifo #{Shellwords.escape(control_fifo)}",
    "--long-lived",
    "--ready-match #{Shellwords.escape("INSPECTOR READY")}",
    "--ready-emit INSPECTOR_READY",
    "--boot-token-file #{Shellwords.escape(boot_token_file)}",
  ].join(" ")
  system("tmux", "send-keys", "-t", inspector_pane, launch_cmd, "Enter")

  ready = wait_for_log_substrings(log_file,
    ["MC_STATE INSPECTOR_READY", "INSPECTOR READY", "BASELINE AUDIT:"], timeout_sec: 120)
  die("INSPECTOR_BOOT_TIMEOUT") unless ready

  # Boot token now exists (written by wrapper at startup)
  marker = inspector_marker_path(rt_dir)
  die("INSPECTOR_BOOT_TOKEN_MISSING: wrapper did not write boot token") unless marker
  ok = send_standing_order_via_fifo(rt_dir, marker, batch_id, stories, current_phase)
  die("INSPECTOR_STANDING_ORDER_FAILED: FIFO send failed after fresh launch") unless ok

  context.merge("inspector_status" => "ready", "inspector_mode" => "wrapper")
end

def inspector_ready_from_log?(project_root, session_name, generation, pane_id)
  log_file = runtime_pane_log_file(project_root, session_name, generation, pane_id)
  log_text = pane_log_text(log_file)
  log_text.include?("INSPECTOR READY") || log_text.include?("BASELINE AUDIT:")
end

def inspector_log_file(project_root, session_name, pane_id)
  generation = read_generation_lock(project_root)
  runtime_pane_log_file(project_root, session_name, generation, pane_id)
end

INSPECTOR_BOOT_TOKEN_FILENAME = "inspector-boot.token"

def inspector_boot_token_path(rt_dir)
  File.join(rt_dir, INSPECTOR_BOOT_TOKEN_FILENAME)
end

def read_inspector_boot_token(rt_dir)
  path = inspector_boot_token_path(rt_dir)
  return nil unless File.exist?(path)
  content = File.read(path).strip
  token = {}
  content.each_line do |line|
    k, v = line.strip.split("=", 2)
    token[k] = v if k && v
  end
  token
rescue StandardError
  nil
end

def inspector_marker_path(rt_dir)
  token = read_inspector_boot_token(rt_dir)
  return nil unless token && token["boot_id"]
  File.join(rt_dir, "inspector-standing-order-#{token["boot_id"]}.sent")
end

def wrapper_running?(rt_dir, inspector_pane)
  pane_cmd = `tmux display-message -p -t "#{inspector_pane}" '\#{pane_current_command}' 2>/dev/null`.strip rescue ""
  return false unless command_matches?(pane_cmd, "python3") || command_matches?(pane_cmd, "python")

  token = read_inspector_boot_token(rt_dir)
  return false unless token && token["wrapper_pid"]
  begin
    Process.kill(0, Integer(token["wrapper_pid"]))
    true
  rescue Errno::ESRCH, Errno::EPERM, ArgumentError
    false
  end
end

def legacy_ready_token(log_file)
  return nil unless File.exist?(log_file)
  offset = nil
  pos = 0
  File.foreach(log_file) do |line|
    clean = clean_terminal_output(line)
    if clean.include?("INSPECTOR READY")
      offset = pos
    end
    pos += line.bytesize
  end
  offset ? "legacy-#{offset}" : nil
rescue StandardError
  nil
end

def legacy_marker_path(rt_dir, log_file)
  token = legacy_ready_token(log_file)
  return nil unless token
  File.join(rt_dir, "inspector-standing-order-#{token}.sent")
end

def detect_inspector_mode(project_root, session_name, generation, inspector_pane)
  rt_dir = runtime_dir(project_root, session_name, generation)
  if wrapper_running?(rt_dir, inspector_pane)
    "wrapper"
  else
    pane_cmd = `tmux display-message -p -t "#{inspector_pane}" '\#{pane_current_command}' 2>/dev/null`.strip rescue ""
    command_matches?(pane_cmd, "codex") ? "legacy" : "unknown"
  end
end

# Returns true if sent (or already sent), false if send failed
def send_standing_order_via_fifo(rt_dir, marker_file, batch_id, stories, current_phase)
  return true if marker_file && File.exist?(marker_file)

  fifo = File.join(rt_dir, "inspector-control.fifo")
  return false unless File.exist?(fifo)

  order = inspector_standing_order(batch_id, stories, current_phase)
  begin
    Timeout.timeout(5) do
      File.open(fifo, "w") { |f| f.write(order + "\n"); f.flush }
    end
    File.write(marker_file, Time.now.utc.iso8601) if marker_file
    true
  rescue Timeout::Error
    false
  rescue StandardError
    false
  end
end

def send_to_inspector(project_root, session_name, generation, inspector_pane, message)
  rt_dir = runtime_dir(project_root, session_name, generation)
  mode = detect_inspector_mode(project_root, session_name, generation, inspector_pane)

  case mode
  when "wrapper"
    fifo = File.join(rt_dir, "inspector-control.fifo")
    unless File.exist?(fifo)
      return {"success" => false, "error" => "control FIFO missing", "action" => "ensure_inspector"}
    end
    begin
      Timeout.timeout(5) do
        File.open(fifo, "w") { |f| f.write(message + "\n"); f.flush }
      end
      {"success" => true}
    rescue StandardError => e
      {"success" => false, "error" => e.message, "action" => "ensure_inspector"}
    end

  when "legacy"
    paste_block_to_pane(inspector_pane, message, "mc-inspector-msg", submit_key: "Tab")
    {"success" => true}

  else
    {"success" => false, "error" => "unknown inspector mode", "action" => "ensure_inspector"}
  end
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
    session_name = `tmux display-message -p '\#{session_name}' 2>/dev/null`.strip rescue ""
    die("cannot resolve tmux session for batch select") if session_name.empty?

    batch_id = "batch-#{Time.now.utc.strftime('%Y-%m-%d')}-#{rand(1000)}"
    layout = resolve_layout_context(session_name)
    layout = ensure_inspector_ready(
      project_root,
      layout,
      batch_id: batch_id,
      stories: stories,
      current_phase: "batch_selection"
    )

    payload = {
      "batch_id" => batch_id,
      "stories" => stories,
      "config" => {"max_review_cycles" => 3, "max_regression_cycles" => 3, "max_validation_cycles" => 3},
      "session_name" => layout["session_name"],
      "commander_pane" => layout["commander_pane"],
      "inspector_pane" => layout["inspector_pane"],
      "utility_pane" => layout["utility_pane"],
      "bottom_anchor" => layout["bottom_anchor"],
    }
    result = run_script("event-bus.sh", "append", project_root, expected_gen.to_s,
                         "BATCH_SELECTED", "commander", "null", JSON.generate(payload))

    # Also record G1 gate (batch confirmed by user)
    g1_payload = {"gate" => "G1", "verified_by" => "commander", "details" => "user confirmed batch: #{stories_csv}"}
    run_script("event-bus.sh", "append", project_root, expected_gen.to_s,
                "GATE_PASSED", "commander", "null", JSON.generate(g1_payload))

    # Materialize to update gate-state immediately
    run_script("event-bus.sh", "materialize", project_root)

    runtime_manager = script_path("runtime-manager.sh")
    run_local_script(
      runtime_manager,
      "ensure-running",
      project_root,
      expected_gen.to_s,
      layout["session_name"],
      layout["commander_pane"],
      layout["inspector_pane"],
      expected_gen.to_s
    )
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
    # Verify inspector pane is a live codex inspector with protocol readiness.
    begin
      gs_path = File.join(project_root, "_bmad-output", "implementation-artifacts", "gate-state.yaml")
      gs = File.exist?(gs_path) ? (YAML.safe_load(File.read(gs_path)) rescue {}) : {}
      session_name = gs["session_name"] || `tmux display-message -p '\#{session_name}' 2>/dev/null`.strip rescue ""
      inspector_line = `tmux list-panes -t "#{session_name}" -F '\#{pane_id} \#{pane_title}' 2>/dev/null`.lines
        .find { |l| l.include?("mc-inspector") } rescue nil
      if inspector_line
        inspector_pane = inspector_line.split.first
        pane_cmd = `tmux display-message -p -t "#{inspector_pane}" '\#{pane_current_command}' 2>/dev/null`.strip rescue ""
        generation = read_generation_lock(project_root)
        clean_tail = pane_log_text(runtime_pane_log_file(project_root, session_name, generation, inspector_pane))
        if clean_tail.empty?
          pane_tail = `tmux capture-pane -t "#{inspector_pane}" -p -S -80 2>/dev/null` rescue ""
          clean_tail = clean_terminal_output(pane_tail)
        end

        payload["inspector_pane"] = inspector_pane
        payload["pane_command"] = pane_cmd

        if !command_matches?(pane_cmd, "codex")
          payload["result"] = "not_ready"
          payload["warning"] = "inspector pane exists but is running '#{pane_cmd}' instead of codex"
        elsif clean_tail.include?("INSPECTOR READY") || clean_tail.include?("BASELINE AUDIT:")
          payload["result"] = "ready"
        else
          payload["result"] = "warming"
          payload["warning"] = "codex inspector pane exists but readiness sentinel not observed"
        end
      else
        payload["result"] = "missing"
        payload["warning"] = "inspector pane not found"
      end
    rescue StandardError => e
      payload["result"] = "error"
      payload["error"] = e.message
    end

  when "ensure_inspector"
    begin
      gs_path = File.join(project_root, "_bmad-output", "implementation-artifacts", "gate-state.yaml")
      gs = File.exist?(gs_path) ? (YAML.safe_load(File.read(gs_path)) rescue {}) : {}
      session_name = gs["session_name"] || `tmux display-message -p '\#{session_name}' 2>/dev/null`.strip rescue ""
      die("cannot resolve session for ensure_inspector") if session_name.to_s.empty?

      layout = resolve_layout_context(session_name)
      batch_id = gs["batch_id"] || "batch-unknown"
      stories = gs["batch_stories"] || []
      current_phase = gs.dig("story_states")&.values&.map { |s| s["phase"] }&.compact&.first || "runtime_repair"
      layout = ensure_inspector_ready(
        project_root,
        layout,
        batch_id: batch_id,
        stories: stories,
        current_phase: current_phase
      )
      payload["result"] = "ready"
      payload["inspector_pane"] = layout["inspector_pane"]
    rescue StandardError => e
      payload["result"] = "failed"
      payload["error"] = e.message
    end

  when "ensure_runtime"
    begin
      gs_path = File.join(project_root, "_bmad-output", "implementation-artifacts", "gate-state.yaml")
      gs = File.exist?(gs_path) ? (YAML.safe_load(File.read(gs_path)) rescue {}) : {}
      session_name = gs["session_name"] || `tmux display-message -p '\#{session_name}' 2>/dev/null`.strip rescue ""
      die("cannot resolve session for ensure_runtime") if session_name.to_s.empty?

      layout = resolve_layout_context(session_name)
      layout = ensure_inspector_ready(
        project_root,
        layout,
        batch_id: gs["batch_id"] || "batch-unknown",
        stories: gs["batch_stories"] || [],
        current_phase: gs.dig("story_states")&.values&.map { |s| s["phase"] }&.compact&.first || "runtime_repair"
      )

      runtime_manager = script_path("runtime-manager.sh")
      runtime_status = run_local_script(
        runtime_manager,
        "ensure-running",
        project_root,
        expected_gen.to_s,
        layout["session_name"],
        layout["commander_pane"],
        layout["inspector_pane"],
        expected_gen.to_s
      )
      payload["result"] = "ready"
      payload["runtime_status"] = runtime_status
    rescue StandardError => e
      payload["result"] = "failed"
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
    begin
      gs_path = File.join(project_root, "_bmad-output", "implementation-artifacts", "gate-state.yaml")
      gs = File.exist?(gs_path) ? (YAML.safe_load(File.read(gs_path)) rescue {}) : {}
      session_name = gs["session_name"].to_s

      if session_name.empty?
        payload["result"] = "error"
        payload["error"] = "session_name not found in gate-state"
      else
        generation = read_generation_lock(project_root)
        log_dir = runtime_mc_logs_dir(project_root, session_name, generation)
        issues = []
        repaired = []

        unless Dir.exist?(log_dir)
          issues << "mc-logs directory missing: #{log_dir}"
        end

        pane_stories = gs.dig("panes", "stories") || {}
        all_panes = pane_stories.values.flat_map { |v| v.is_a?(Hash) ? v.values : [v] }
        all_panes << gs.dig("panes", "inspector") if gs.dig("panes", "inspector")

        all_panes.compact.uniq.each do |pane_id|
          log_file = File.join(log_dir, "pane-#{pane_id.delete('%')}.log")

          pane_alive = begin
            out = `tmux list-panes -t "#{session_name}" -F '\#{pane_id}' 2>/dev/null`.lines.map(&:strip)
            out.include?(pane_id)
          rescue StandardError
            false
          end

          unless File.exist?(log_file)
            if pane_alive
              issues << "log file missing for active pane #{pane_id}"
              ensure_pipe_logging(project_root, session_name, generation, pane_id)
              repaired << pane_id
            end
            next
          end

          if pane_alive
            mtime = File.mtime(log_file) rescue Time.at(0)
            age = (Time.now - mtime).to_i
            if age > 120
              issues << "log stale for active pane #{pane_id} (#{age}s since last write)"
            end
            ensure_pipe_logging(project_root, session_name, generation, pane_id)
          end
        end

        payload["result"] = issues.empty? ? "healthy" : "degraded"
        payload["issues"] = issues unless issues.empty?
        payload["repaired_panes"] = repaired unless repaired.empty?
      end
    rescue StandardError => e
      payload["result"] = "error"
      payload["error"] = e.message
    end
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
  consumer = runtime_consumer_name(project_root, expected_gen, "commander")
  args = ["peek", project_root, expected_gen.to_s, "--consumer", consumer]
  args += ["--types", cmd.types] if cmd.types
  args += ["--limit", cmd.limit.to_s] if cmd.limit
  args << "--priority" if cmd.priority
  result = run_script("event-bus.sh", *args)
  puts result
end

def handle_ack_events(project_root, expected_gen, cmd)
  die("ACK_EVENTS requires --seq") unless cmd.seq
  consumer = runtime_consumer_name(project_root, expected_gen, "commander")
  result = run_script("event-bus.sh", "ack", project_root, "--consumer", consumer, "--seq", cmd.seq.to_s)
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
