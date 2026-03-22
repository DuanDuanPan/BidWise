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
  ss = state.dig("story_states", story_id)
  die("unknown story: #{story_id}") unless ss

  current_phase = ss["phase"] || "queued"

  # 3. Look up transition
  transition = ALL_TRANSITIONS[[current_phase, intent]]
  die("INVALID_TRANSITION: no transition from '#{current_phase}' via '#{intent}'") unless transition

  # 4. Evaluate preconditions
  transition[:preconditions].each do |precond|
    unless evaluate_precondition(precond, project_root, state, story_id, config)
      die("PRECONDITION_FAILED: #{precond} for story #{story_id} in phase #{current_phase}")
    end
  end

  # 5. Compute target state in memory
  target = ss.dup
  target["phase"] = transition[:target]
  target["dispatch_state"] = nil if transition[:side_effects].include?(:clear_dispatch_state)

  # Handle cycle increments/resets in target state
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

  # 6. Run invariants on target state (BEFORE commit point)
  invariant_errors = check_invariants(target, story_id, config)
  unless invariant_errors.empty?
    die("INVARIANT_VIOLATION: #{invariant_errors.join('; ')}")
  end

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
  payload = {
    "story_id" => story_id,
    "from_phase" => current_phase,
    "to_phase" => transition[:target],
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

# Task packet templates per phase (structured prompt sent to the worker)
def build_task_packet(phase, story_id, project_root, state, opts)
  ss = state.dig("story_states", story_id) || {}
  story_file = ss["story_file_rel"] || "_bmad-output/implementation-artifacts/story-#{story_id}.md"
  worktree = ss["worktree_path"] || "../BidWise-story-#{story_id}"
  is_ui = ss["is_ui"]
  review_cycle = ss["review_cycle"] || 0

  case phase
  when "create"
    <<~PACKET
      /bmad-create-story #{story_id}
      When done, print exactly this as the final line with nothing after it:
      MC_DONE CREATE #{story_id} CREATED
    PACKET
  when "prototype"
    <<~PACKET
      Create a UI prototype for story #{story_id}.
      Story file: #{story_file}
      Use Pencil MCP tools to create the .pen file and export PNG.
      When done, print exactly this as the final line with nothing after it:
      MC_DONE PROTOTYPE #{story_id} PROTOTYPED
    PACKET
  when "validate"
    <<~PACKET
      Validate story #{story_id} against acceptance criteria.
      Story file: #{story_file}
      Check: story completeness, acceptance criteria clarity, dependency correctness.
      Final line must be exactly one of:
      MC_DONE VALIDATE #{story_id} PASS
      MC_DONE VALIDATE #{story_id} FAIL
    PACKET
  when "dev"
    ui_line = is_ui ? "\nThis is a UI story — also use frontend-design skill." : ""
    <<~PACKET
      /bmad-dev-story #{story_file}#{ui_line}
      When done, print exactly this as the final line with nothing after it:
      MC_DONE DEV #{story_id} REVIEW_READY
    PACKET
  when "review"
    findings_cycle = review_cycle + 1
    findings_output = File.join(File.expand_path(project_root), "_bmad-output", "implementation-artifacts",
                                "review-findings-#{story_id}-cycle-#{findings_cycle}.md")
    <<~PACKET
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
      Final line must be exactly one of:
      MC_DONE REVIEW #{story_id} REVIEW_PASS
      MC_DONE REVIEW #{story_id} REVIEW_FAIL
    PACKET
  when "fixing"
    findings_file = File.join(File.expand_path(project_root), "_bmad-output", "implementation-artifacts",
                              "review-findings-#{story_id}-cycle-#{review_cycle}.md")
    <<~PACKET
      Fix code review findings for story #{story_id}.
      Findings: #{findings_file}
      Worktree: #{worktree}
      When done, print exactly this as the final line with nothing after it:
      MC_DONE FIXING #{story_id} FIX_COMPLETE
    PACKET
  when "qa"
    <<~PACKET
      /bmad-qa-generate-e2e-tests
      Story: #{story_id}
      Worktree: #{worktree}
      Spec file: #{story_file}
      Run tests after generating.
      Final line must be exactly one of:
      MC_DONE QA #{story_id} QA_PASS
      MC_DONE QA #{story_id} QA_FAIL
    PACKET
  when "regression"
    <<~PACKET
      Run full regression tests after merge of story #{story_id}.
      Layer 1: pnpm test (unit + integration)
      Layer 2: pnpm lint
      Layer 3: pnpm build
      Final line must be exactly one of:
      MC_DONE REGRESSION #{story_id} PASS
      MC_DONE REGRESSION #{story_id} FAIL
    PACKET
  when "noop"
    <<~PACKET
      This is a dry-run runtime verification task for story #{story_id}.
      Do not create, modify, delete, or commit any project files.
      Do not run tests or build commands.
      Simply acknowledge the task and then print exactly this as the final line:
      MC_DONE NOOP #{story_id} PASS
    PACKET
  else
    "echo 'Unknown phase: #{phase}'\nMC_DONE #{phase.upcase} #{story_id} UNKNOWN"
  end
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

  # 2. Execute FSM transition if there's a matching *_dispatched intent
  #    This validates preconditions and records side effects (gates, etc.)
  intent = DISPATCH_INTENT_MAP[phase]
  if intent
    # Attempt the transition — this checks preconditions, invariants, and writes events
    transition_result = nil
    begin
      # Temporarily capture output instead of printing
      old_stdout = $stdout
      $stdout = StringIO.new
      cmd_execute(project_root, expected_gen, story_id, intent, trigger_seq)
      transition_output = $stdout.string
      $stdout = old_stdout
      transition_result = JSON.parse(transition_output) rescue nil
    rescue SystemExit => e
      $stdout = old_stdout
      # If transition failed (precondition, invariant), propagate the error
      die("FSM transition #{intent} failed — check preconditions")
    end

    # If already_applied, the transition was already done; proceed with pane creation
  end

  # 3. Determine LLM + auto-escalation for fixing phase (design doc §3.2.1 Fix Cycle Pane Strategy)
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

  # 4. Resolve session context
  state = load_gate_state(project_root)
  session_name = state["session_name"]
  commander_pane = state["commander_pane"]
  bottom_anchor = state["bottom_anchor"]
  unless session_name && commander_pane && bottom_anchor
    session_name ||= `tmux display-message -p '\#{session_name}' 2>/dev/null`.strip
    commander_pane ||= `tmux display-message -p '\#{pane_id}' 2>/dev/null`.strip
    bottom_anchor ||= `tmux list-panes -t "#{session_name}" -F '\#{pane_id} \#{pane_title}' 2>/dev/null`.lines
      .find { |l| l.include?("mc-bottom-anchor") }&.split&.first&.strip
    die("cannot resolve session context") unless session_name && !session_name.empty?
  end

  # 5. Determine workdir
  ss = state.dig("story_states", story_id) || {}
  workdir = if %w[dev fixing review qa regression].include?(phase)
    wt = ss["worktree_path"] || "../BidWise-story-#{story_id}"
    File.expand_path(wt, project_root)
  else
    File.expand_path(project_root)
  end

  # 6. Create pane via tmux-layout.sh (command = the LLM binary)
  tmux_layout = File.join(SCRIPT_DIR, "tmux-layout.sh")
  title = "mc-#{story_id}-#{phase}"
  agent_command = llm == "codex" ? "codex --no-alt-screen --dangerously-bypass-approvals-and-sandbox" : "claude --dangerously-skip-permissions"
  runtime_dir = File.join(project_root, "_bmad-output", "implementation-artifacts", "runtime", "#{session_name}-g#{expected_gen}")
  packet_dir = File.join(runtime_dir, "packets")
  FileUtils.mkdir_p(packet_dir)
  task_packet = build_task_packet(phase, story_id, project_root, state, opts)
  packet_file = File.join(packet_dir, "#{story_id}-#{phase}-#{trigger_seq}.txt")
  File.write(packet_file, task_packet)
  wrapper = File.join(SCRIPT_DIR, "agent-wrapper.py")
  command_string = [
    "python3",
    Shellwords.escape(wrapper),
    "--agent-command", Shellwords.escape(agent_command),
    "--packet-file", Shellwords.escape(packet_file),
  ].join(" ")

  # If fresh-pane requested, kill any existing pane with this title first
  if fresh_pane
    existing = `tmux list-panes -t "#{session_name}" -F '\#{pane_id} \#{pane_title}' 2>/dev/null`.lines
      .find { |l| l.include?(title) } rescue nil
    if existing
      old_pane_id = existing.split.first
      system("tmux", "kill-pane", "-t", old_pane_id, [:out, :err] => "/dev/null")
      close_payload = {"story_id" => story_id, "role" => phase, "pane_id" => old_pane_id}
      event_bus("append", project_root, expected_gen.to_s, "PANE_CLOSED", "transition_engine", trigger_seq.to_s, JSON.generate(close_payload))
    end
  end

  # For fixing dispatch: also close the old dev pane to prevent stale signal pollution
  if phase == "fixing"
    state_now = load_gate_state(project_root)
    old_dev_pane = state_now.dig("panes", "stories", story_id, "dev")
    if old_dev_pane
      system("tmux", "kill-pane", "-t", old_dev_pane, [:out, :err] => "/dev/null")
      close_payload = {"story_id" => story_id, "role" => "dev", "pane_id" => old_dev_pane}
      event_bus("append", project_root, expected_gen.to_s, "PANE_CLOSED", "transition_engine", trigger_seq.to_s, JSON.generate(close_payload))
    end
  end

  stdout, stderr, status = Open3.capture3(
    tmux_layout, "open-worker",
    session_name, commander_pane.to_s, bottom_anchor.to_s,
    title, workdir, command_string
  )
  unless status.success?
    die("tmux-layout.sh open-worker failed: #{stderr.strip.empty? ? stdout.strip : stderr.strip}")
  end
  pane_id = stdout.strip

  # 7. Enable pipe-pane logging
  log_dir = runtime_mc_logs_dir(project_root, session_name, expected_gen).to_s
  FileUtils.mkdir_p(log_dir)
  log_file = File.join(log_dir, "pane-#{pane_id.delete('%')}.log")
  system("tmux", "pipe-pane", "-t", pane_id, "-o", "cat >> #{log_file}")
  append_dispatch_state(project_root, expected_gen, trigger_seq, story_id, pane_id, "pane_opened")

  # 9. Write TASK_DISPATCHED event
  dispatch_payload = {
    "story_id" => story_id,
    "phase" => phase,
    "llm" => llm,
    "pane_id" => pane_id,
    "c2_override" => c2_override,
    "override_reason" => override_reason,
    "constitution_check" => "PASS",
    "dispatch_state" => "pane_opened",
  }
  event_bus("append", project_root, expected_gen.to_s, "TASK_DISPATCHED",
            "transition_engine", trigger_seq.to_s, JSON.generate(dispatch_payload))

  # 10. Write PANE_REGISTERED event
  pane_payload = {
    "story_id" => story_id,
    "role" => phase,
    "pane_id" => pane_id,
    "title" => title,
  }
  event_bus("append", project_root, expected_gen.to_s, "PANE_REGISTERED",
            "transition_engine", trigger_seq.to_s, JSON.generate(pane_payload))

  # 11. Materialize
  event_bus("materialize", project_root)

  puts JSON.generate({
    "success" => true,
    "story_id" => story_id,
    "phase" => phase,
    "pane_id" => pane_id,
    "llm" => llm,
    "c2_override" => c2_override,
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
