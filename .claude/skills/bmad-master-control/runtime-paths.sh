#!/usr/bin/env bash
# Shared runtime path helpers for master-control daemons.

artifacts_dir() {
  printf '%s\n' "$1/_bmad-output/implementation-artifacts"
}

runtime_root_dir() {
  printf '%s\n' "$(artifacts_dir "$1")/runtime"
}

generation_lock_path() {
  printf '%s\n' "$(artifacts_dir "$1")/generation.lock"
}

read_generation_for_project() {
  local project_root="${1:?project_root required}"
  local generation="${2:-}"
  if [[ -n "$generation" ]]; then
    printf '%s\n' "$generation"
    return
  fi

  local lock_path
  lock_path="$(generation_lock_path "$project_root")"
  if [[ -f "$lock_path" ]]; then
    tr -d '[:space:]' < "$lock_path"
  else
    printf '0\n'
  fi
}

runtime_id_for() {
  local session_name="${1:?session_name required}"
  local generation="${2:?generation required}"
  printf '%s\n' "${session_name}-g${generation}"
}

runtime_dir_for() {
  local project_root="${1:?project_root required}"
  local session_name="${2:?session_name required}"
  local generation="${3:?generation required}"
  printf '%s\n' "$(runtime_root_dir "$project_root")/$(runtime_id_for "$session_name" "$generation")"
}

ensure_runtime_dir() {
  local project_root="${1:?project_root required}"
  local session_name="${2:?session_name required}"
  local generation="${3:?generation required}"
  local dir
  dir="$(runtime_dir_for "$project_root" "$session_name" "$generation")"
  mkdir -p "$dir"
  printf '%s\n' "$dir"
}

runtime_mc_logs_dir_for() {
  local project_root="${1:?project_root required}"
  local session_name="${2:?session_name required}"
  local generation="${3:?generation required}"
  printf '%s\n' "$(runtime_dir_for "$project_root" "$session_name" "$generation")/mc-logs"
}

ensure_runtime_mc_logs_dir() {
  local project_root="${1:?project_root required}"
  local session_name="${2:?session_name required}"
  local generation="${3:?generation required}"
  local dir
  dir="$(runtime_mc_logs_dir_for "$project_root" "$session_name" "$generation")"
  mkdir -p "$dir"
  printf '%s\n' "$dir"
}

link_runtime_artifact() {
  local target="${1:?target required}"
  local link_path="${2:?link_path required}"
  mkdir -p "$(dirname "$link_path")"
  ln -sfn "$target" "$link_path"
}
