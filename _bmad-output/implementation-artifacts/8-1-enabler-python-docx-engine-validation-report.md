结果: PASS

## 摘要

本次按 `validate-create-story` 工作流（`bmad-create-story` Validate Mode）复核 Story 8.1：`_bmad-output/implementation-artifacts/8-1-enabler-python-docx-engine.md`，并直接回写了所有可安全修正的 story-spec 问题。复核覆盖 create-story workflow/checklist、规划源文档、当前代码结构、IPC/preload/错误/日志/路径工具模式、sprint 状态、近期 git 记录，以及 PyPI 官方依赖元数据。

已核对工件：
- `_bmad/bmm/config.yaml`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/workflow.md`
- `_bmad/bmm/workflows/4-implementation/bmad-create-story/checklist.md`
- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/prd.md`
- `_bmad-output/planning-artifacts/architecture.md`
- `_bmad-output/planning-artifacts/ux-design-specification.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/8-1-enabler-python-docx-engine.md`
- `_bmad-output/implementation-artifacts/3-8-mermaid-diagram-generation.md`
- `package.json`
- `.gitignore`
- `src/shared/ipc-types.ts`
- `src/shared/constants.ts`
- `src/main/utils/errors.ts`
- `src/main/utils/logger.ts`
- `src/main/utils/project-paths.ts`
- `src/main/ipc/create-handler.ts`
- `src/main/ipc/drawio-handlers.ts`
- `src/main/ipc/document-handlers.ts`
- `src/main/ipc/index.ts`
- `src/preload/index.ts`
- `tests/unit/preload/security.test.ts`
- `src/main/index.ts`
- `src/main/services/document-parser/word-extractor.ts`
- `src/main/services/task-queue/index.ts`
- PyPI official JSON metadata: `python-docx`, `fastapi`, `uvicorn`, `pydantic`, `pytest`, `httpx`

Sprint status already had `epic-8: in-progress` and `8-1-enabler-python-docx-engine: ready-for-dev`; no sprint-status edit was required.

## 发现的关键问题

None

## 已应用增强

- 补回 create-story 模板应有的 validation note：`Run validate-create-story for quality check before dev-story`。
- 修正 Python 启动协议：
  - `python -m docx_renderer --host 127.0.0.1 --port 0`
  - READY 必须输出实际端口 `READY:{actual_port}`
  - 单次启动 10 秒超时，最多 3 次重试，失败后降级为不可用且不阻塞 Electron 窗口启动
  - 明确 uvicorn `port=0` 需预绑定 socket 后通过 `getsockname()` 获取真实端口，禁止监听 `0.0.0.0`
- 补齐 `/api/shutdown` 路由、Python 文件树、测试项和 `app.will-quit` 退出策略，消除 AC7 提到 shutdown 但任务树未定义 route 的断层。
- 修正 Python HTTP payload 字段边界：
  - Python 内部保留 snake_case
  - HTTP/IPC JSON 必须使用 TypeScript 侧 camelCase
  - 明确 Pydantic alias 与 `by_alias=True`，避免 Node 手动 snake_case ↔ camelCase 转换
- 修正 `docx:health` preload/API 类型：
  - `IpcChannelMap['docx:health']` input 为 `void`
  - preload 实现为 `docxHealth: () => typedInvoke(IPC_CHANNELS.DOCX_HEALTH)`
- 修正模板错误语义：
  - 缺失模板复用现有 `TEMPLATE_NOT_FOUND`
  - 无效模板使用 `DOCX_TEMPLATE_INVALID`
  - 禁止新增语义重复的 `DOCX_TEMPLATE_NOT_FOUND`
- 补齐 `DocxBridgeError extends BidWiseError` 要求，避免后续实现时只在文档中引用不存在的错误类型。
- 补齐输出路径安全边界：
  - renderer 传入的 `outputPath` 不可信
  - docx-bridge 必须用 `resolveProjectDataPath(projectId)` 限制写入项目 `exports/`
  - 路径逃逸返回 `VALIDATION`，不得发送到 Python 进程
- 修正 Electron 主进程启动策略：
  - `registerIpcHandlers()` 先注册
  - docx-bridge 后台启动，禁止 `createWindow()` 前 await Python 启动
  - `will-quit` 先停 docx-bridge，再销毁 DB，并记录退出错误
- 明确 task-queue 边界：8.1 的 `docx:render` 只是连通性和烟雾渲染通道；8.3 的用户可见一键 docx 导出仍必须通过 `taskQueue` 封装。
- 扩展测试清单：
  - Python `test_shutdown.py`
  - camelCase 请求/响应覆盖
  - 模板无效错误覆盖
  - process-manager 的 `cwd`、`PYTHONPATH`、host/port、3 次重试覆盖
  - docx-bridge service 的 `outputPath` 路径逃逸覆盖
  - main 启动不阻塞窗口创建覆盖
  - integration test 覆盖 READY 实际端口、shutdown 和 docx 输出
- 补充依赖版本复核记录。2026-04-08 PyPI latest：`python-docx 1.2.0`、`fastapi 0.135.3`、`uvicorn 0.44.0`、`pydantic 2.12.5`、`pytest 9.0.3`、`httpx 0.28.1`。Story 保留最低版本约束，以测试通过作为兼容性判据。
- 补充 References：task-queue 白名单约束与 PyPI 官方依赖元数据链接。

## 剩余风险

None

## 最终结论

经 `validate-create-story` 复核与原位修正后，Story 8.1 已无剩余可执行阻塞项。故事文件现在对 Python 进程启动、shutdown、IPC/preload 类型、错误码、路径安全、task-queue 边界、测试覆盖和依赖版本依据均给出明确实现指令，结论为 PASS。
