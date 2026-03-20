#!/usr/bin/env bash
# BidWise Story Pipeline - tmux 分屏编排
# 用法: ./scripts/pipeline.sh <command> <story-id> [args...]
#
# 在 tmux 内运行，自动在旁边打开新 pane 执行任务

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

usage() {
    cat <<'USAGE'
BidWise Story Pipeline - tmux 分屏编排

用法:
  ./scripts/pipeline.sh <command> <story-id> [args...]

命令:
  validate <story-id>       在右侧 pane 启动 codex 验证 story
  dev <story-id>            在右侧 pane 启动新 claude 会话执行 dev-story
  review <story-id>         在右侧 pane 启动 codex 进行 code-review
  fix <story-id> <file>     在右侧 pane 启动 codex 修复指定问题

布局命令:
  parallel <id1> <id2>      为两个 story 创建四格布局（各自 claude + codex）
  status                    查看所有 pane 状态

示例:
  ./scripts/pipeline.sh validate 1-1
  ./scripts/pipeline.sh review 1-2
  ./scripts/pipeline.sh parallel 1-2 1-4

USAGE
}

check_tmux() {
    if [ -z "${TMUX:-}" ]; then
        echo "错误: 请在 tmux 会话内运行此脚本"
        echo "启动 tmux: tmux new-session -s bidwise"
        exit 1
    fi
}

# 在右侧打开新 pane 并运行命令
open_right_pane() {
    local title="$1"
    shift
    local cmd="$*"

    # 创建右侧 pane（50% 宽度）
    tmux split-window -h -c "$REPO_ROOT" -l 50%
    # 重命名 pane（通过设置标题）
    tmux select-pane -T "$title"
    # 发送命令
    tmux send-keys "$cmd" Enter
    # 焦点回到左侧 pane
    tmux select-pane -L
}

# 在下方打开新 pane
open_bottom_pane() {
    local title="$1"
    shift
    local cmd="$*"

    tmux split-window -v -c "$REPO_ROOT" -l 50%
    tmux select-pane -T "$title"
    tmux send-keys "$cmd" Enter
    tmux select-pane -U
}

cmd_validate() {
    local story_id="$1"
    local story_file="_bmad-output/implementation-artifacts/story-${story_id}.md"

    if [ ! -f "${REPO_ROOT}/${story_file}" ]; then
        echo "错误: story 文件不存在: ${story_file}"
        exit 1
    fi

    echo "在右侧 pane 启动 codex 验证 story ${story_id}..."
    open_right_pane "codex:validate-${story_id}" \
        "codex \"/validate-create-story ${story_file}\""
    echo "codex 验证已启动，在右侧 pane 查看进度"
}

cmd_dev() {
    local story_id="$1"
    local story_file="_bmad-output/implementation-artifacts/story-${story_id}.md"

    echo "在右侧 pane 启动 claude dev-story ${story_id}..."
    open_right_pane "claude:dev-${story_id}" \
        "claude \"/bmad-dev-story ${story_file}\""
    echo "claude dev-story 已启动"
}

cmd_review() {
    local story_id="$1"

    echo "在右侧 pane 启动 codex code-review story ${story_id}..."
    open_right_pane "codex:review-${story_id}" \
        "codex \"/bmad-code-review\""
    echo "codex code-review 已启动"
}

cmd_fix() {
    local story_id="$1"
    local review_file="${2:-}"
    # LLM 分工遵循 constitution.md C2:
    #   默认: 修复 = claude
    #   升级: 加 --escalate 使用 codex（仅当 claude 连续 2 次失败时）
    local llm="claude"
    local llm_cmd="claude --dangerously-skip-permissions"
    if [ "${3:-}" = "--escalate" ]; then
        llm="codex"
        llm_cmd="codex -c model_reasoning_summary_format=experimental --search --dangerously-bypass-approvals-and-sandbox"
    fi

    if [ -n "$review_file" ]; then
        echo "在右侧 pane 启动 ${llm} 修复..."
        open_right_pane "${llm}:fix-${story_id}" \
            "${llm_cmd} \"根据 ${review_file} 中的审查意见修复代码\""
    else
        echo "在右侧 pane 启动 ${llm} 修复..."
        open_right_pane "${llm}:fix-${story_id}" \
            "${llm_cmd} \"修复上一轮 code-review 中的问题\""
    fi
    echo "${llm} 修复已启动"
}

# 四格并行布局：两个 story 各有 claude + codex pane
cmd_parallel() {
    local id1="$1"
    local id2="$2"

    echo "创建四格并行布局: story ${id1} + story ${id2}"

    # 当前 pane 作为 story 1 的 claude
    tmux select-pane -T "claude:${id1}"

    # 右侧: story 2 的 claude
    tmux split-window -h -c "$REPO_ROOT" -l 50%
    tmux select-pane -T "claude:${id2}"

    # 左下: story 1 的 codex
    tmux select-pane -L
    tmux split-window -v -c "$REPO_ROOT" -l 50%
    tmux select-pane -T "codex:${id1}"

    # 右下: story 2 的 codex
    tmux select-pane -R
    tmux split-window -v -c "$REPO_ROOT" -l 50%
    tmux select-pane -T "codex:${id2}"

    # 回到左上 pane
    tmux select-pane -t 0

    echo ""
    echo "四格布局已创建："
    echo "┌──────────────────┬──────────────────┐"
    echo "│ claude: ${id1}       │ claude: ${id2}       │"
    echo "├──────────────────┼──────────────────┤"
    echo "│ codex: ${id1}        │ codex: ${id2}        │"
    echo "└──────────────────┴──────────────────┘"
    echo ""
    echo "用 Ctrl+B 方向键 在 pane 之间切换"
}

cmd_status() {
    echo "=== 当前 Pane 布局 ==="
    tmux list-panes -F "Pane #{pane_index}: #{pane_title} (#{pane_width}x#{pane_height}) #{?pane_active,[ACTIVE],}"
}

# 主入口
check_tmux

case "${1:-}" in
    validate)  shift; cmd_validate "$@" ;;
    dev)       shift; cmd_dev "$@" ;;
    review)    shift; cmd_review "$@" ;;
    fix)       shift; cmd_fix "$@" ;;
    parallel)  shift; cmd_parallel "$@" ;;
    status)    cmd_status ;;
    *)         usage ;;
esac
