#!/usr/bin/env bash
# BidWise Worktree 管理工具
# 用法: ./scripts/worktree.sh <command> [args...]

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORKTREE_BASE="$(dirname "$REPO_ROOT")"

usage() {
    cat <<'USAGE'
BidWise Worktree 管理工具

用法:
  ./scripts/worktree.sh <command> [args...]

命令:
  create <story-id> [story-id...]   为指定 story 创建 worktree
  list                              列出所有活跃的 worktree
  status                            查看所有 worktree 的开发状态
  merge <story-id>                  将 story 分支合并回 main
  remove <story-id> [story-id...]   移除 worktree 和分支
  open <story-id>                   打印 cd 命令和 claude 启动命令
  cleanup                           移除所有已合并的 worktree

示例:
  ./scripts/worktree.sh create 1-2 1-4 1-5
  ./scripts/worktree.sh status
  ./scripts/worktree.sh merge 1-2
  ./scripts/worktree.sh remove 1-2 1-4 1-5

USAGE
}

worktree_path() {
    local story_id="$1"
    echo "${WORKTREE_BASE}/BidWise-story-${story_id}"
}

branch_name() {
    local story_id="$1"
    echo "story/${story_id}"
}

cmd_create() {
    if [ $# -eq 0 ]; then
        echo "错误: 请指定至少一个 story-id"
        echo "用法: ./scripts/worktree.sh create <story-id> [story-id...]"
        exit 1
    fi

    for story_id in "$@"; do
        local wt_path
        wt_path="$(worktree_path "$story_id")"
        local branch
        branch="$(branch_name "$story_id")"

        if [ -d "$wt_path" ]; then
            echo "⚠ Worktree 已存在: ${wt_path}"
            continue
        fi

        echo "创建 worktree: story/${story_id} → ${wt_path}"
        git -C "$REPO_ROOT" worktree add "$wt_path" -b "$branch"

        # 安装依赖并重建 native modules for Electron
        if [ -f "$wt_path/pnpm-lock.yaml" ]; then
            echo "  安装依赖 (pnpm install)..."
            (cd "$wt_path" && pnpm install --frozen-lockfile 2>&1 | tail -1) || { echo "  ⚠ pnpm install 失败，请手动执行"; continue; }

            echo "  重建 native modules for Electron..."
            (cd "$wt_path" && pnpm exec electron-builder install-app-deps 2>&1 | tail -3) || { echo "  ⚠ electron-builder install-app-deps 失败，请手动执行"; continue; }

            # 验证 better-sqlite3 已为 Electron ABI 编译
            local electron_abi
            electron_abi=$(cd "$wt_path" && node -e "console.log(require('electron/package.json').version)" 2>/dev/null || echo "")
            if [ -n "$electron_abi" ]; then
                local sqlite_binding
                sqlite_binding=$(find "$wt_path/node_modules/better-sqlite3/build" -name "*.node" 2>/dev/null | head -1)
                if [ -n "$sqlite_binding" ] && file "$sqlite_binding" | grep -q "Mach-O\|ELF"; then
                    echo "  ✓ better-sqlite3 native module rebuilt (Electron ${electron_abi})"
                else
                    echo "  ⚠ better-sqlite3 native binding 未找到或格式异常，请手动验证: cd ${wt_path} && pnpm exec electron-builder install-app-deps"
                fi
            fi
        fi
        echo "  完成"
    done

    echo ""
    echo "=== 启动开发 ==="
    for story_id in "$@"; do
        local wt_path
        wt_path="$(worktree_path "$story_id")"
        echo "Terminal ${story_id}:"
        echo "  cd ${wt_path} && claude"
        echo ""
    done
}

cmd_list() {
    echo "=== 活跃 Worktree ==="
    git -C "$REPO_ROOT" worktree list
}

cmd_status() {
    echo "=== Worktree 开发状态 ==="
    echo ""

    local worktrees
    worktrees=$(git -C "$REPO_ROOT" worktree list --porcelain | grep "^worktree " | sed 's/^worktree //')

    for wt in $worktrees; do
        # 跳过主仓库
        if [ "$wt" = "$REPO_ROOT" ]; then
            continue
        fi

        local branch
        branch=$(git -C "$wt" branch --show-current 2>/dev/null || echo "detached")
        local dirty=""
        if [ -n "$(git -C "$wt" status --porcelain 2>/dev/null)" ]; then
            dirty=" [有未提交的修改]"
        fi
        local commit_count
        commit_count=$(git -C "$wt" rev-list --count main..HEAD 2>/dev/null || echo "?")
        local last_msg
        last_msg=$(git -C "$wt" log -1 --format="%s" 2>/dev/null || echo "无提交")

        echo "$(basename "$wt")"
        echo "  分支: ${branch}"
        echo "  提交数(相对main): ${commit_count}"
        echo "  最新提交: ${last_msg}"
        echo "  状态: ${dirty:-干净}"
        echo ""
    done
}

cmd_merge() {
    if [ $# -ne 1 ]; then
        echo "错误: 请指定一个 story-id"
        echo "用法: ./scripts/worktree.sh merge <story-id>"
        exit 1
    fi

    local story_id="$1"
    local branch
    branch="$(branch_name "$story_id")"
    local wt_path
    wt_path="$(worktree_path "$story_id")"

    # 确保在 main 分支上
    local current_branch
    current_branch=$(git -C "$REPO_ROOT" branch --show-current)
    if [ "$current_branch" != "main" ]; then
        echo "错误: 请先切到 main 分支"
        exit 1
    fi

    # 检查 worktree 是否有未提交的修改
    if [ -d "$wt_path" ] && [ -n "$(git -C "$wt_path" status --porcelain 2>/dev/null)" ]; then
        echo "错误: worktree ${wt_path} 有未提交的修改，请先提交或暂存"
        exit 1
    fi

    echo "合并 ${branch} → main ..."

    # 检查 .pen 文件是否被修改（应只在 main 的 Phase 1 修改）
    if [ -d "$wt_path" ]; then
        local pen_changes
        pen_changes=$(git -C "$wt_path" diff main --name-only 2>/dev/null | grep '\.pen$' || true)
        if [ -n "$pen_changes" ]; then
            echo "⚠ 警告: 检测到 .pen 文件在 worktree 中被修改（应只在 main 分支修改）:"
            echo "$pen_changes" | sed 's/^/    /'
            echo ""
        fi
    fi

    # 先 rebase story 分支到最新 main
    if [ -d "$wt_path" ]; then
        echo "  Rebase ${branch} onto main..."
        if ! git -C "$wt_path" rebase main; then
            echo "错误: rebase 失败，存在冲突。请手动解决:"
            echo "  cd ${wt_path}"
            echo "  # 解决冲突后: git rebase --continue"
            echo "  # 放弃 rebase: git rebase --abort"
            exit 1
        fi
    fi

    # 合并
    git -C "$REPO_ROOT" merge "$branch" --no-ff -m "feat: merge ${branch} into main"
    echo "  合并完成"

    # 自动更新 sprint-status.yaml
    local sprint_status="${REPO_ROOT}/_bmad-output/implementation-artifacts/sprint-status.yaml"
    if [ -f "$sprint_status" ]; then
        sed -i '' "s/^\(  ${story_id}-[^:]*:\) .*/\1 done/" "$sprint_status"
        sed -i '' "s/^last_updated: .*/last_updated: $(date +%Y-%m-%d)/" "$sprint_status"
        git -C "$REPO_ROOT" add "$sprint_status"
        git -C "$REPO_ROOT" commit -m "chore: update sprint-status — story ${story_id} done"
        echo "  已自动更新 sprint-status.yaml (story ${story_id} → done)"
    else
        echo "  ⚠ 未找到 sprint-status.yaml，请手动更新状态"
    fi
}

cmd_remove() {
    if [ $# -eq 0 ]; then
        echo "错误: 请指定至少一个 story-id"
        exit 1
    fi

    for story_id in "$@"; do
        local wt_path
        wt_path="$(worktree_path "$story_id")"
        local branch
        branch="$(branch_name "$story_id")"

        if [ -d "$wt_path" ]; then
            echo "移除 worktree: ${wt_path}"
            git -C "$REPO_ROOT" worktree remove "$wt_path" --force
        fi

        # 删除本地分支（仅当已合并时）
        if git -C "$REPO_ROOT" branch --list "$branch" | grep -q "$branch"; then
            if git -C "$REPO_ROOT" branch -d "$branch" 2>/dev/null; then
                echo "  删除已合并分支: ${branch}"
            else
                echo "  ⚠ 分支 ${branch} 未合并，保留。如需强制删除请使用: git branch -D ${branch}"
            fi
        fi
    done
}

cmd_open() {
    if [ $# -ne 1 ]; then
        echo "错误: 请指定一个 story-id"
        exit 1
    fi

    local story_id="$1"
    local wt_path
    wt_path="$(worktree_path "$story_id")"

    if [ ! -d "$wt_path" ]; then
        echo "错误: Worktree 不存在。请先运行: ./scripts/worktree.sh create ${story_id}"
        exit 1
    fi

    echo "=== 启动 Story ${story_id} 开发 ==="
    echo ""
    echo "请在新终端中运行:"
    echo "  cd ${wt_path} && claude"
    echo ""
    echo "Story 文件位置:"
    local story_file
    story_file=$(find "$wt_path/_bmad-output/implementation-artifacts" -name "story-${story_id}*" 2>/dev/null | head -1)
    if [ -n "$story_file" ]; then
        echo "  ${story_file}"
    else
        echo "  未找到 story 文件（可能尚未创建）"
    fi
}

cmd_cleanup() {
    echo "=== 清理已合并的 Worktree ==="

    local worktrees
    worktrees=$(git -C "$REPO_ROOT" worktree list --porcelain | grep "^worktree " | sed 's/^worktree //')

    for wt in $worktrees; do
        if [ "$wt" = "$REPO_ROOT" ]; then
            continue
        fi

        local branch
        branch=$(git -C "$wt" branch --show-current 2>/dev/null || continue)

        # 检查是否已合并到 main
        if git -C "$REPO_ROOT" branch --merged main | grep -q "$branch"; then
            echo "清理已合并的 worktree: $(basename "$wt") (${branch})"
            git -C "$REPO_ROOT" worktree remove "$wt"
            git -C "$REPO_ROOT" branch -d "$branch" 2>/dev/null || true
        fi
    done

    echo "清理完成"
}

# 主入口
case "${1:-}" in
    create)  shift; cmd_create "$@" ;;
    list)    cmd_list ;;
    status)  cmd_status ;;
    merge)   shift; cmd_merge "$@" ;;
    remove)  shift; cmd_remove "$@" ;;
    open)    shift; cmd_open "$@" ;;
    cleanup) cmd_cleanup ;;
    *)       usage ;;
esac
