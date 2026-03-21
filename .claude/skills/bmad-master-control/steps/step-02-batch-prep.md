---
batch_stories: []
stories_to_create: []
stories_to_reuse: []
ui_stories: []
backend_only_stories: []
story_registry: {}
current_session: ''
inspector_pane: ''
utility_pane: ''
---

# Step 2: Batch Preparation (on main branch)

## GUARDS
- Read `../constitution.md` before proceeding
- Read `session-journal.yaml` if it exists
- Read `../forbidden-list.md`
- **AUTH: L0** — batch 准备是标准流转，直接执行
- **LLM:** create story = claude | validate = codex | commit = claude
- **ROLE:** 指挥官通过子窗格派发，不自己编辑

## RULES
1. **C4 批处理:** 先批量 create → 再批量 prototype → 再统一 validate → 单次 batch commit。禁止逐 story 闭环 (F1)
2. **F2:** 全 batch 一次 commit，禁止逐 story 单独 commit
3. **F6:** 向 `bmad-create-story` 派发时必须明确指定 story ID
4. **C5/F3:** prototype.pen 只读，每 story 派生到 story-{id}.pen
5. **F4:** validate FAIL 修复后必须重新验证

## INSTRUCTIONS

### Preflight
1. Read gate-state.yaml → 确认 G1 PASS
2. 初始化 `story_registry[story_id]`:
   - 按优先级解析 story file 路径:
     1. `_bmad-output/implementation-artifacts/story-{story_id}.md`
     2. `_bmad-output/implementation-artifacts/{story_key}.md`
     3. 在 `_bmad-output/implementation-artifacts/` 下查找匹配 `*{story_id}*.md`（排除 `*validation*`）
   - backlog story 的路径初始可为空，待 2a 创建后回填
3. Partition batch: stories_to_create / stories_to_reuse / ui_stories / backend_only_stories

### 2a: Create missing story files (backlog only, sequential)
4. For each story in `stories_to_create`:
   - Execute pre-dispatch (Read `../pre-dispatch-checklist.md`)
   - Open claude sub-pane, send task packet:
     ```
     Skill: bmad-create-story
     Goal: Create story file for explicitly assigned story
     Inputs:
     - story id: {story_id}
     - story key: {story_key}
     - project root: {project_root}
     Constraints:
     - use only this explicit story target; do not auto-select another
     - update sprint tracking as required
     Expected Output:
     - MC_DONE CREATE_STORY {story_id}
     ```
   - 完成后回填 story_registry[story_id] 路径
   - 关闭 pane，继续下一个（不做 validate/commit）

### GATE G2: create → prototype
- **Assert foreach batch_stories:** story_registry[story_id].story_file_main 非空
- **Assert foreach batch_stories:** `test -f {story_file_main}`
- **On pass:** 更新 gate-state.yaml G2 PASS

### 2b: Add prototypes (UI stories only, where missing)
5. For each story in `ui_stories` that lacks current prototype:
   - Execute pre-dispatch
   - **Pre-create files** via utility_pane (Pencil MCP has no save-as):
     ```bash
     cp _bmad-output/implementation-artifacts/prototypes/prototype.pen _bmad-output/implementation-artifacts/prototypes/story-{id}.pen
     mkdir -p _bmad-output/implementation-artifacts/prototypes/story-{id}/
     ```
   - Open claude sub-pane, instruct prototype + F13 落盘 + 导出（同一个 pane 完成全流程，保留 Pencil 内存状态）:
     ```
     Goal: Create story prototype with forced disk save
     Inputs:
     - story id: {story_id}
     - source pen: {project_root}/_bmad-output/implementation-artifacts/prototypes/story-{id}.pen
     - reference pen: {project_root}/_bmad-output/implementation-artifacts/prototypes/prototype.pen
     - export dir: {project_root}/_bmad-output/implementation-artifacts/prototypes/story-{id}/
     Steps:
     1. open_document to open story-{id}.pen (NOT prototype.pen — C5/F3)
     2. batch_get to read standard frames/tokens from prototype.pen for reference
     3. batch_design to create story-specific frames prefixed with "Story {id} —"
     4. [F13 强制落盘] open_document story-{id}.pen again, then batch_get(readDepth=99, includePathGeometry=true) to capture full in-memory node tree, then Python write to disk:
        import json
        with open("{source_pen_path}") as f:
            pen = json.load(f)
        pen["children"] = in_memory_children
        with open("{source_pen_path}", "w") as f:
            json.dump(pen, f, ensure_ascii=False, indent=2)
     5. export_nodes to export reference PNGs to export dir
     Expected Output:
     - MC_DONE PROTOTYPE_SAVED {story_id}
     ```
   - Close sub-pane after MC_DONE PROTOTYPE_SAVED
   - **Commander 磁盘验证（在 allowed-tools 范围内）：**
     - 通过 tmux: `ls -la _bmad-output/implementation-artifacts/prototypes/story-{id}.pen`（文件大小 > prototype.pen）
     - 通过 tmux: `ls _bmad-output/implementation-artifacts/prototypes/story-{id}/` (PNG 存在)
     - If verify fails → HALT
   - Update `_bmad-output/implementation-artifacts/prototypes/prototype-manifest.yaml` with story entry (via utility_pane)

### GATE G3: prototype → validate
- **Assert foreach ui_stories:** `test -f _bmad-output/implementation-artifacts/prototypes/story-{id}.pen`
- **Assert foreach ui_stories:** at least 1 PNG under `_bmad-output/implementation-artifacts/prototypes/story-{id}/`
- **Assert foreach ui_stories:** story_id in `_bmad-output/implementation-artifacts/prototypes/prototype-manifest.yaml`
- **Assert foreach backend_only_stories:** SKIP (no prototype required)
- **On pass:** 更新 gate-state.yaml G3 PASS

### 2c: Validate entire batch (PARALLEL, codex)
6. For each story in batch, **simultaneously** open separate codex sub-panes:
   - Execute pre-dispatch for each (LLM = codex)
   - Send task packet:
     ```
     Role: story validation
     Goal: Validate story contract before development
     Inputs:
     - story id: {story_id}
     - story file: {story_file_main}
     - checklist: {project_root}/.claude/skills/bmad-create-story/checklist.md
     Constraints:
     - read checklist before validating
     - do not modify files
     Expected Output:
     - MC_DONE VALIDATE {story_id} PASS|FAIL
     ```
7. Poll all validate panes round-robin. Collect PASS/FAIL per story. Close each after result.
8. If any FAIL:
   - Open claude pane to fix story file/prototype per findings
   - Re-validate only failed stories (new codex panes)
   - Max 3 validation cycles per story. Exceed → HALT

### GATE G4: validate → commit
- **Assert foreach batch_stories:** validation_status[story_id] == PASS
- **On pass:** 更新 gate-state.yaml G4 PASS

### 2d: Single batch commit
9. Open claude pane, git add all new/updated story/prototype artifacts
10. Single commit covering all prepared stories (F2: 禁止逐 story 单独 commit)
11. If no file changes needed (all reused) → skip commit
12. Close pane

### GATE G5 (Inspector): batch commit → worktree
- Self-check: `git log -1` 包含 batch story IDs, story files 全存在, `git status` 干净
- **Inspector gate:**
  - 写入 gate-report-G5.md (通过 utility_pane)
  - 发送审查请求到 inspector_pane: "请审查 Gate G5"
  - 轮询 inspector_pane 直到 `APPROVE → L0 AUTO-EXECUTE` 或 `APPROVE → SESSION-RESTART` 或 `REJECT → HALT`
  - REJECT → HALT
- **On `APPROVE → L0 AUTO-EXECUTE`:** 更新 gate-state.yaml G5 PASS (verified_by: inspector)，**立即读取 step-03 继续执行，不通知用户、不等待确认（C3-L0 + F5）**
- **On `APPROVE → SESSION-RESTART`:** Inspector 已将 G5 PASS 写入 gate-state.yaml 并即将重启 commander。Commander 无需额外动作——等待被重启即可。新 commander 从 gate-state.yaml 恢复，路由到 step-03。

## CHECKPOINT
- 所有 story 文件已创建/确认
- UI story 原型已派生 + 导出
- 全 batch validation PASS
- 统一 commit 已完成
- G5 inspector APPROVE

## NEXT
Read fully and follow `./step-03-launch-dev.md`
