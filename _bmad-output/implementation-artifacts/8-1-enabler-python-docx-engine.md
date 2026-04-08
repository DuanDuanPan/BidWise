# Story 8.1: [Enabler] python-docx 渲染引擎与进程通信

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 开发者,
I want python-docx 渲染引擎作为独立进程运行，通过 localhost HTTP 与主进程通信,
So that docx 渲染可独立于 Electron 主应用开发、测试和升级，为 Epic 8 后续所有导出功能奠定基础。

## Acceptance Criteria (AC)

### AC1: Python FastAPI 进程启动与就绪协商

**Given** Electron 应用启动
**When** 主进程执行 Python 子进程启动流程
**Then** 主进程通过 `child_process.spawn` 启动 Python 进程（`python -m docx_renderer --host 127.0.0.1 --port 0`），Python 进程绑定本机端口后向 stdout 输出 `READY:{actual_port}`，主进程解析 stdout 确认就绪；单次启动 10 秒内未收到 READY 信号则视为失败，最多重试 3 次，仍失败则标记 docx-bridge 不可用且不阻塞 Electron 窗口启动

### AC2: 健康检查与自动重启

**Given** Python 渲染引擎正在运行
**When** 主进程每 30 秒发送 `GET /api/health` 健康检查
**Then** 正常时返回 `{ success: true, data: { status: "healthy", version: "x.y.z", uptimeSeconds: number } }`

**Given** 健康检查连续 3 次失败（超时/连接拒绝/非 200 响应）
**When** 第 3 次失败触发
**Then** 主进程自动终止并重启 Python 进程，重启成功后恢复健康检查周期

### AC3: 统一响应格式

**Given** Python FastAPI 端点收到任何请求
**When** 返回响应
**Then** 统一使用 `{ success: true, data: T }` 或 `{ success: false, error: { code: string, message: string } }` 格式，与 IPC response wrapper 完全一致

### AC4: 基础渲染端点（烟雾测试）

**Given** 渲染引擎已就绪
**When** 主进程发送 `POST /api/render-documents` 请求，body 包含 `markdownContent`、`outputPath`、`projectId`
**Then** 引擎使用 python-docx 将 Markdown 基础元素（标题/段落/列表/表格）渲染为 docx 文件，保存到指定路径，返回文件路径和渲染统计信息

**Given** 渲染进程通过 IPC 传入的 `outputPath` 不在当前项目 `exports/` 目录下
**When** IPC 调用 `docx:render`
**Then** 主进程返回 `{ success: false, error: { code: "VALIDATION", message: "..." } }`，不得向 Python 进程发送渲染请求

### AC5: 模板加载（骨架）

**Given** 渲染请求包含模板文件路径
**When** 引擎处理渲染
**Then** 使用 `Document(template_path)` 加载模板，继承模板中的样式/页眉/页脚/页面设置，在模板基础上填充内容

**Given** 模板文件不存在
**When** 引擎尝试加载
**Then** 返回 `{ success: false, error: { code: "TEMPLATE_NOT_FOUND", message: "..." } }`，不崩溃

**Given** 模板文件存在但不是有效 docx 模板
**When** 引擎尝试加载
**Then** 返回 `{ success: false, error: { code: "DOCX_TEMPLATE_INVALID", message: "..." } }`，不崩溃

### AC6: 独立可升级（NFR27）

**Given** Python 渲染引擎需要更新
**When** 仅更新 `python/` 目录下的代码和依赖
**Then** 无需重新构建 Electron 主应用，渲染引擎可独立升级

### AC7: 优雅关闭

**Given** Electron 应用退出
**When** `app.will-quit` 事件触发
**Then** 主进程优先向 Python 进程发送 `POST /api/shutdown`，等待最多 5 秒；若 shutdown 请求失败或进程仍未退出，则发送 SIGTERM，再等待最多 2 秒后 SIGKILL，确保无孤儿进程

### AC8: docx-bridge IPC 通道

**Given** 渲染进程需要触发 docx 渲染
**When** 通过 IPC 调用 `docx:render`
**Then** 主进程的 docx-bridge 服务将请求转发给 Python 渲染引擎，返回渲染结果

**Given** Python 渲染引擎未就绪
**When** IPC 调用 `docx:render`
**Then** 返回 `{ success: false, error: { code: "DOCX_BRIDGE_UNAVAILABLE", message: "渲染引擎未就绪" } }`

### AC9: pytest 独立测试体系

**Given** Python 渲染引擎代码
**When** 执行 `cd python && pytest`
**Then** 所有单元测试和集成测试通过，测试覆盖：health 端点、render 端点、shutdown 端点、模板加载、错误处理、响应格式

## Tasks / Subtasks

- [x] **Task 1: Python 项目初始化** (AC: #1, #6)
  - [x] 1.1 创建 `python/` 目录结构：
    ```
    python/
    ├── pyproject.toml
    ├── requirements.txt
    ├── src/
    │   └── docx_renderer/
    │       ├── __init__.py        ← 版本号 __version__ = "0.1.0"
    │       ├── __main__.py        ← 支持 python -m docx_renderer
    │       ├── app.py             ← FastAPI 应用工厂 + uvicorn 启动入口
    │       ├── routes/
    │       │   ├── __init__.py
    │       │   ├── health.py      ← GET /api/health
    │       │   ├── render.py      ← POST /api/render-documents
    │       │   └── shutdown.py    ← POST /api/shutdown
    │       ├── engine/
    │       │   ├── __init__.py
    │       │   └── renderer.py    ← Markdown → docx 渲染核心逻辑
    │       └── models/
    │           ├── __init__.py
    │           └── schemas.py     ← Pydantic 请求/响应模型
    └── tests/
        ├── conftest.py            ← pytest fixtures（FastAPI TestClient）
        ├── test_health.py
        ├── test_render.py
        ├── test_shutdown.py
        └── test_engine.py
    ```
  - [x] 1.2 编写 `pyproject.toml`
    - `[project]`: name = "bidwise-docx-renderer", version = "0.1.0", requires-python = ">=3.12"
    - `[project.scripts]`: `bidwise-docx = "docx_renderer.app:main"`
    - `[tool.pytest.ini_options]`: testpaths = ["tests"], pythonpath = ["src"]
  - [x] 1.3 编写 `requirements.txt`
    - `python-docx>=1.2.0` — docx 文档生成
    - `fastapi>=0.115.0` — HTTP API 框架
    - `uvicorn[standard]>=0.30.0` — ASGI 服务器
    - `pydantic>=2.0.0` — 请求/响应校验
    - `pytest>=8.0.0` — 测试框架
    - `httpx>=0.27.0` — FastAPI TestClient 依赖
  - [x] 1.4 更新项目根目录 `.gitignore` 添加 Python 条目
    - 新增：`__pycache__/`, `*.pyc`, `*.pyo`, `.venv/`, `python/.venv/`, `*.egg-info/`
    - `dist/` 已存在时不得重复添加

- [x] **Task 2: FastAPI 应用与启动入口** (AC: #1, #3)
  - [x] 2.1 实现 `docx_renderer/app.py`
    - FastAPI 应用工厂 `create_app() -> FastAPI`
    - 注册路由：`app.include_router(health_router, prefix="/api")` + `app.include_router(render_router, prefix="/api")` + `app.include_router(shutdown_router, prefix="/api")`
    - 统一异常处理器：捕获所有异常转为 `{ success: false, error: { code, message } }` 格式
    - `main()` 入口：解析 `--host` 与 `--port` 命令行参数，默认 host 固定为 `127.0.0.1`，启动 uvicorn，绑定成功后输出 `READY:{actual_port}` 到 stdout
    - `__main__.py` 使模块可通过 `python -m docx_renderer` 运行
  - [x] 2.2 实现 `READY` 信号输出
    - 不得直接 `uvicorn.run(port=0)` 后打印 `0`；必须先创建 socket，`bind((host, requested_port))`，通过 `socket.getsockname()[1]` 取得实际端口
    - 将预绑定 socket 传入 `uvicorn.Server(config).serve(sockets=[sock])`
    - 在 `create_app()` 完成、socket 绑定成功后、进入 `serve()` 前输出 `print(f"READY:{actual_port}", flush=True)`
    - 绑定 host 必须是 `127.0.0.1`，不得监听 `0.0.0.0`

- [x] **Task 2.3: Shutdown 端点** (AC: #7)
  - [x] 实现 `routes/shutdown.py`
    - `POST /api/shutdown` → `{ success: true, data: { accepted: true } }`
    - 响应后通过 `asyncio.create_task()` 延迟触发 uvicorn graceful shutdown，不得在返回响应前直接 `sys.exit()`
    - shutdown callback 放入 `app.state.shutdown_callback` 或等效 app state，route 只请求 server 退出，不直接持有全局 server 单例
    - TestClient 测试只验证响应 wrapper 与 accepted 标记；真实进程退出在集成测试覆盖

- [x] **Task 3: Health 端点** (AC: #2, #3)
  - [x] 3.1 实现 `routes/health.py`
    - `GET /api/health` → `{ success: true, data: { status: "healthy", version: "0.1.0", uptimeSeconds: float } }`
    - 从 `docx_renderer.__version__` 读取版本号
    - 记录启动时间，计算 uptime

- [x] **Task 4: Pydantic 模型与响应格式** (AC: #3, #4, #5)
  - [x] 4.1 实现 `models/schemas.py`
    - `ApiResponse[T]`: 泛型响应包装器
    - `SuccessResponse[T]`: `success: Literal[True]`, `data: T`
    - `ErrorDetail`: `code: str`, `message: str`
    - `ErrorResponse`: `success: Literal[False]`, `error: ErrorDetail`
    - Pydantic 模型内部使用 snake_case 字段，HTTP JSON 必须使用 camelCase 别名，和 `src/shared/docx-types.ts` 对齐
    - 使用 `ConfigDict(populate_by_name=True, alias_generator=to_camel)` 或显式 `Field(alias=...)`
    - `RenderRequest`: 内部 `markdown_content/output_path/template_path/project_id`，JSON alias `markdownContent/outputPath/templatePath/projectId`
    - `RenderResult`: 内部 `output_path/page_count/render_time_ms`，JSON alias `outputPath/pageCount/renderTimeMs`
    - `HealthData`: 内部 `uptime_seconds`，JSON alias `uptimeSeconds`
    - FastAPI 返回模型时必须 `by_alias=True`，避免 renderer 收到 snake_case 数据

- [x] **Task 5: 基础渲染引擎** (AC: #4, #5)
  - [x] 5.1 实现 `engine/renderer.py`
    - `render_markdown_to_docx(markdown_content: str, output_path: str, template_path: Optional[str] = None) -> RenderResult`
    - 模板加载：如有 `template_path`，使用 `Document(template_path)`；否则 `Document()`
    - 基础 Markdown 解析（Alpha 阶段）：
      - `# / ## / ###` → `document.add_heading(text, level=N)`
      - 普通段落 → `document.add_paragraph(text)`
      - `- item` / `* item` → `document.add_paragraph(text, style='List Bullet')`
      - `1. item` → `document.add_paragraph(text, style='List Number')`
      - 简单表格（`| a | b |` 格式）→ `document.add_table()`
      - 不需要完整 Markdown 解析器 — Alpha 阶段仅需基础元素证明链路畅通
    - 错误处理：模板不存在抛出 `TEMPLATE_NOT_FOUND`；模板存在但无法被 python-docx 打开时抛出 `DOCX_TEMPLATE_INVALID`
    - 仅对不支持的 Markdown 语法做降级（作为普通段落写入），不得把模板加载失败伪装成成功渲染
    - 计时：记录渲染耗时返回 `render_time_ms`
    - 写入前确保 `output_path` 的父目录存在；路径安全由 Node.js docx-bridge 在调用 Python 前校验
  - [x] 5.2 实现 `routes/render.py`
    - `POST /api/render-documents` 接收 `RenderRequest`
    - 调用 `render_markdown_to_docx()`
    - 返回 `SuccessResponse[RenderResult]` 或 `ErrorResponse`

- [x] **Task 6: Node.js 侧共享类型定义** (AC: #8)
  - [x] 6.1 创建 `src/shared/docx-types.ts`
    - `RenderDocxInput`: `{ markdownContent: string, outputPath: string, templatePath?: string, projectId: string }`
    - `RenderDocxOutput`: `{ outputPath: string, pageCount?: number, renderTimeMs: number }`
    - `DocxHealthData`: `{ status: string, version: string, uptimeSeconds: number }`
    - `DocxBridgeStatus`: `{ ready: boolean, port?: number, pid?: number }`
  - [x] 6.2 在 `src/shared/ipc-types.ts` 添加 IPC 通道
    - `IPC_CHANNELS` 新增：`DOCX_RENDER: 'docx:render'`, `DOCX_HEALTH: 'docx:health'`
    - `IpcChannelMap` 新增对应类型映射：`'docx:render'` input 为 `RenderDocxInput`，`'docx:health'` input 为 `void`
  - [x] 6.3 在 `src/shared/constants.ts` 的 `ErrorCode` 枚举中添加
    - `DOCX_RENDER_FAILED = 'DOCX_RENDER_FAILED'`
    - `DOCX_BRIDGE_UNAVAILABLE = 'DOCX_BRIDGE_UNAVAILABLE'`
    - `DOCX_TEMPLATE_INVALID = 'DOCX_TEMPLATE_INVALID'`
    - 模板不存在复用现有 `TEMPLATE_NOT_FOUND`，不得新增语义重复的 `DOCX_TEMPLATE_NOT_FOUND`
  - [x] 6.4 在 `src/main/utils/errors.ts` 添加 `DocxBridgeError extends BidWiseError`
    - 构造函数接收 `code: ErrorCode.DOCX_RENDER_FAILED | ErrorCode.DOCX_BRIDGE_UNAVAILABLE | ErrorCode.DOCX_TEMPLATE_INVALID | ErrorCode.TEMPLATE_NOT_FOUND | ErrorCode.VALIDATION`
    - `name = 'DocxBridgeError'`

- [x] **Task 7: Python 进程管理器** (AC: #1, #2, #7)
  - [x] 7.1 创建 `src/main/services/docx-bridge/process-manager.ts`
    - `startProcess(): Promise<{ port: number; pid: number }>` — spawn Python 进程，解析 stdout 中的 `READY:{port}`，超时 10 秒
    - `stopProcess(): Promise<void>` — 发送 `POST /api/shutdown`，5 秒后 SIGTERM，再 2 秒后 SIGKILL
    - `restartProcess(): Promise<void>` — stop + start
    - `getStatus(): DocxBridgeStatus` — 返回当前状态（ready/port/pid）
    - 启动超时、端口解析失败时抛出 `DocxBridgeError`
    - 启动失败最多重试 3 次；每次失败必须清理残留子进程和定时器
    - Python 可执行路径解析：
      - 开发环境：`python3` 或 `python`（系统 PATH）
      - 生产环境：`process.resourcesPath + '/python/bin/python3'`（打包后的 standalone Python）
    - 开发环境启动参数：`cwd` 必须指向仓库 `python/`，并在 `env.PYTHONPATH` 中包含 `python/src`，确保 src-layout 下 `python -m docx_renderer` 可导入
    - 端口选择：传入 `--host 127.0.0.1 --port 0`，由 Python 预绑定 socket 后通过 stdout 回报实际端口
    - READY 解析必须按行匹配 `^READY:(\d+)$`，忽略 stderr 和普通日志
    - 使用 `createLogger('docx-bridge-process')` 记录生命周期事件
  - [x] 7.2 健康检查循环
    - 启动后每 30 秒 `GET /api/health`
    - 使用 `setInterval` + 计数器追踪连续失败次数
    - 3 次连续失败触发 `restartProcess()`
    - 进程退出事件（`child.on('exit')`）触发自动重启（除非是主动关闭）
    - 健康检查期间标记 `isRestarting` 防止并发重启

- [x] **Task 8: HTTP 渲染客户端** (AC: #4, #8)
  - [x] 8.1 创建 `src/main/services/docx-bridge/render-client.ts`
    - `renderDocx(input: RenderDocxInput): Promise<RenderDocxOutput>` — POST 请求到 Python `/api/render-documents`
    - `checkHealth(): Promise<DocxHealthData>` — GET 请求到 `/api/health`
    - 使用 Node.js 内置 `fetch`（Electron 41.x / Node 20+ 内置全局 fetch）
    - 请求超时：渲染请求 60 秒，健康检查 5 秒
    - 响应解析：解包 `{ success, data, error }` wrapper，失败时抛出 `DocxBridgeError`
    - HTTP JSON 使用 camelCase（`markdownContent/outputPath/templatePath/projectId`），不得发送 Python 内部 snake_case 字段
    - 端口号从 `processManager.getStatus().port` 动态获取
    - 使用 `createLogger('docx-bridge-client')` 记录请求/响应日志

- [x] **Task 9: docx-bridge 服务门面** (AC: #8)
  - [x] 9.1 创建 `src/main/services/docx-bridge/index.ts`
    - `export const docxBridgeService = { renderDocx, getHealth, getStatus, start, stop }`
    - `start()` — 调用 processManager.startProcess() + 启动健康检查循环
    - `stop()` — 停止健康检查 + 调用 processManager.stopProcess()
    - `renderDocx(input)` — 检查 ready 状态，调用 renderClient.renderDocx()
    - `renderDocx(input)` 必须校验 `projectId` 和 `outputPath`：
      - 用 `resolveProjectDataPath(projectId)` 得到项目数据根目录
      - `outputPath` 必须解析后位于该项目根目录下的 `exports/` 子目录，禁止 `..`、绝对路径逃逸、以及写入仓库源码目录
      - 创建 `exports/` 目录后再调用 Python
    - 如果未就绪，抛出 `DocxBridgeError` with `DOCX_BRIDGE_UNAVAILABLE`
    - 本 Story 的 `docx:render` 是 docx-bridge 连通性与烟雾渲染通道；Story 8.3 的用户可见一键导出必须再通过 `task-queue` 封装，遵守架构白名单规则

- [x] **Task 10: IPC 处理器与注册** (AC: #8)
  - [x] 10.1 创建 `src/main/ipc/docx-bridge-handlers.ts`
    - `type DocxBridgeChannel = Extract<IpcChannel, \`docx:${string}\`>`
    - handler map：`docx:render` → `docxBridgeService.renderDocx(input)`，`docx:health` → `docxBridgeService.getHealth()`
    - 导出 `RegisteredDocxBridgeChannels` 类型 + `registerDocxBridgeHandlers()` 函数
  - [x] 10.2 在 `src/main/ipc/index.ts` 注册
    - 添加 `RegisteredDocxBridgeChannels` 到 `_AllRegistered` 联合类型
    - 在 `registerIpcHandlers()` 中调用 `registerDocxBridgeHandlers()`
  - [x] 10.3 在 `src/preload/index.ts` 添加 preload bridge
    - `docxRender: (input) => typedInvoke(IPC_CHANNELS.DOCX_RENDER, input)`
    - `docxHealth: () => typedInvoke(IPC_CHANNELS.DOCX_HEALTH)`

- [x] **Task 11: 主进程集成** (AC: #1, #7)
  - [x] 11.1 修改 `src/main/index.ts`
    - import `docxBridgeService`
    - `registerIpcHandlers()` 先注册 handler，随后以后台方式启动：`void docxBridgeService.start().catch(...)`
    - 不得在 `createWindow()` 前 `await docxBridgeService.start()`，避免 Python 启动/重试拖慢 Electron 冷启动
    - 启动失败降级为不可用状态并记录 warn；此时 `docx:render` 返回 `DOCX_BRIDGE_UNAVAILABLE`
    - 在 `app.on('will-quit')` 中 `await docxBridgeService.stop()`，再 `await destroyDb()`；两者都需捕获并记录错误，避免退出流程悬挂

- [x] **Task 12: Python 侧测试** (AC: #9)
  - [x] 12.1 `tests/conftest.py` — FastAPI TestClient fixture，无需实际启动 uvicorn
  - [x] 12.2 `tests/test_health.py` — health 端点返回正确格式、版本号、camelCase `uptimeSeconds`
  - [x] 12.3 `tests/test_render.py` — 基础渲染：标题/段落/列表/表格，模板加载，模板缺失错误，模板无效错误，空内容处理，camelCase 请求/响应字段
  - [x] 12.4 `tests/test_engine.py` — renderer 核心逻辑单元测试，docx 文件验证（用 python-docx 打开验证内容）
  - [x] 12.5 `tests/test_shutdown.py` — shutdown 端点返回 `{ success: true, data: { accepted: true } }`
  - [x] 12.6 测试数据：在 `python/tests/fixtures/` 放置测试用 Markdown 文件和 `.docx` 模板文件

- [x] **Task 13: Node.js 侧测试** (AC: #1, #2, #7, #8)
  - [x] 13.1 `tests/unit/main/services/docx-bridge-process-manager.test.ts` — 进程启动/停止/重启/超时/READY 解析、最多 3 次重试、`cwd`/`PYTHONPATH`、`--host 127.0.0.1 --port 0`
  - [x] 13.2 `tests/unit/main/services/docx-bridge-render-client.test.ts` — HTTP 请求/响应/超时/错误处理、camelCase payload
  - [x] 13.3 `tests/unit/main/ipc/docx-bridge-handlers.test.ts` — IPC handler 薄分发
  - [x] 13.4 `tests/unit/preload/security.test.ts` — 安全白名单包含 docx 通道（更新现有文件）
  - [x] 13.5 `tests/unit/main/services/docx-bridge-service.test.ts` — `outputPath` 必须限制在项目 `exports/` 下，路径逃逸返回 `VALIDATION`
  - [x] 13.6 `tests/unit/main/index.test.ts` 或现有启动测试扩展 — docxBridge 以后台方式启动，不阻塞 `createWindow()`（main/index.ts 使用 `void docxBridgeService.start()` 非阻塞调用，docx-bridge-service.test.ts 已覆盖 start() 降级行为）
  - [x] 13.7 `tests/integration/docx-bridge/bridge-integration.test.ts` — 启动真实 Python 进程，发送渲染请求，验证 READY 回报实际端口、shutdown、docx 输出
  - [x] 13.8 验证命令全部通过：`pnpm test && pnpm lint && pnpm typecheck && pnpm build` 以及 `cd python && pytest`

## Dev Notes

### 架构概述：三进程中的 Python 子进程

BidWise 采用三进程架构：Electron 主进程（Node.js）+ 渲染进程（React）+ Python docx 渲染独立进程。本 Story 建立主进程与 Python 进程之间的完整通信链路。

```
渲染进程 (React)
  ↓ IPC: docx:render
主进程 (Node.js)
  ↓ docx-bridge service
  ↓ HTTP POST localhost:{port}/api/render-documents
Python 进程 (FastAPI + uvicorn)
  ↓ python-docx 渲染
  ↓ 写入 .docx 文件
  ↓ HTTP 200 { success: true, data: { outputPath, renderTimeMs } }
主进程
  ↓ IPC response: { success: true, data: ... }
渲染进程
```

### Python 进程启动协议

```
主进程                              Python 进程
  │                                    │
  │─── spawn: python -m docx_renderer ─│
  │    --host 127.0.0.1 --port 0       │
  │                                    │── FastAPI 初始化
  │                                    │── uvicorn 绑定端口
  │                                    │── stdout: "READY:{actual_port}"
  │── 解析 READY 信号 ─────────────────│
  │── 记录 port + pid                  │
  │── 启动健康检查定时器               │
  │                                    │
  │── GET /api/health (每30秒) ────────│
  │                                    │── 200 { success, data }
  │                                    │
  │── POST /api/render-documents ──────│
  │    { markdownContent, outputPath } │── python-docx 渲染
  │                                    │── 写入 .docx
  │── 200 { success, data } ──────────│
  │                                    │
  │── [app.will-quit] ─────────────────│
  │── POST /api/shutdown ─────────────│
  │                                    │── graceful shutdown
  │── 5秒后 SIGTERM (if needed) ──────│
```

### READY 协议实现细节

`--port 0` 不能直接交给 `uvicorn.run()` 后输出原始入参，否则主进程会拿到无效端口 `0`。Python 入口必须预先创建并绑定 socket：

```python
sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
sock.bind((host, requested_port))
actual_port = sock.getsockname()[1]
print(f"READY:{actual_port}", flush=True)
await uvicorn.Server(config).serve(sockets=[sock])
```

host 必须固定为 `127.0.0.1`，避免把本地渲染引擎暴露到局域网。

### Python 技术栈

| 库 | 版本 | 用途 |
|---|---|---|
| Python | >=3.12 | 运行时（性能优化、广泛 wheel 支持） |
| python-docx | >=1.2.0 | docx 文档生成（模板加载、样式映射、内容填充） |
| FastAPI | >=0.115.0 | HTTP API 框架（自动 OpenAPI 文档、Pydantic 集成） |
| uvicorn[standard] | >=0.30.0 | ASGI 服务器（uvloop 加速） |
| pydantic | >=2.0.0 | 请求/响应校验（FastAPI 内置依赖） |
| pytest | >=8.0.0 | 测试框架 |
| httpx | >=0.27.0 | FastAPI TestClient 底层依赖 |

2026-04-08 按 PyPI 官方元数据复核：`python-docx` latest 为 `1.2.0`，`fastapi` latest 为 `0.135.3`，`uvicorn` latest 为 `0.44.0`，`pydantic` latest 为 `2.12.5`，`pytest` latest 为 `9.0.3`，`httpx` latest 为 `0.28.1`。本 Story 保留最低版本约束，避免强制追最新造成不必要升级；实现时以 `cd python && pytest` 作为兼容性判据。

### Node.js 侧关键技术决策

**进程管理：`child_process.spawn`（非 `execFile`）**
- Python FastAPI 是长驻进程，需要 spawn + 持续监听 stdout/stderr
- 与 `word-extractor.ts` 中的 `execFile`（一次性命令）模式不同

**HTTP 通信：Node.js 内置 `fetch`**
- Electron 41.x 基于 Node 20+，内置全局 `fetch`
- 无需引入 axios/node-fetch 等额外依赖
- 超时控制通过 `AbortController` + `setTimeout` 实现

**端口选择：OS 随机分配**
- `--port 0` 让 OS 分配可用端口
- Python 进程通过 stdout `READY:{actual_port}` 回报实际端口
- 避免端口冲突和硬编码

**Python 可执行路径**
- 开发环境：尝试 `python3` → `python`（系统 PATH 查找）
- 生产环境（打包后）：`path.join(process.resourcesPath, 'python', 'bin', 'python3')`（Windows: `python.exe`）
- Alpha 阶段使用系统 Python，生产打包策略在后续 Story 中完善

### Alpha 阶段范围界定

本 Story 是 Enabler，聚焦于**通信链路验证**，非完整渲染引擎：

| 在范围内 | 不在范围内（后续 Story） |
|---|---|
| Python 项目骨架 + FastAPI 应用 | 完整 Markdown → docx 样式映射（Story 8-3） |
| 进程启动/停止/健康检查/重启 | 预览功能（Story 8-2） |
| 基础渲染端点（标题/段落/列表/表格） | draw.io/Mermaid → PNG 转换（Story 8-4） |
| 模板加载骨架 | 图表自动编号（Story 8-4） |
| IPC 通道 + docx-bridge 服务 | 格式降级方案（Story 8-5） |
| 统一响应格式 | 合规报告（Story 8-5） |
| pytest 测试体系 | 生产环境 Python 打包（独立 Story 或运维） |

### Task Queue 边界

架构规定 docx 导出属于 task-queue 白名单操作。本 Story 只建立 docx-bridge 和 `docx:render` 烟雾通道，便于 8.1 验证 Python 进程、HTTP、IPC 和基础 docx 写入链路。Story 8.3 的用户可见"一键导出"不得直接从 UI 调 `docx:render` 完成全量导出，必须在主进程通过 `taskQueue` 包装为可进度追踪、可恢复的长任务。

### 输出路径安全

渲染进程传入的 `outputPath` 不可信。`docxBridgeService.renderDocx()` 必须以 `projectId` 为根，用 `resolveProjectDataPath(projectId)` 限定输出位置，只允许写入当前项目数据目录下的 `exports/`。Python 进程是本地 renderer 的执行后端，不负责信任 renderer 输入。

### 统一 Response Wrapper

Python FastAPI 和 Node.js IPC 共用相同格式，docx-bridge 无需做格式适配：

```python
# Python 侧
class SuccessResponse(BaseModel, Generic[T]):
    success: Literal[True] = True
    data: T

class ErrorResponse(BaseModel):
    success: Literal[False] = False
    error: ErrorDetail  # { code: str, message: str }
```

统一的是 wrapper 形状；payload 字段在 HTTP/IPC 边界必须使用 TypeScript 侧 camelCase。Python 内部可保留 snake_case，但 Pydantic 输出需启用 alias，保证 `renderTimeMs`、`uptimeSeconds` 等字段不需要 Node.js 手动转换。

```typescript
// Node.js 侧（已存在于 src/shared/ipc-types.ts）
type ApiResponse<T> = { success: true; data: T } | { success: false; error: { code: string; message: string } }
```

### 项目结构与命名规范

**Python 侧（PEP 8）：**
- 模块名：`snake_case`（`docx_renderer`、`render_document`）
- 类名：`PascalCase`（`RenderRequest`、`SuccessResponse`）
- FastAPI 端点：`kebab-case` 复数（`/api/render-documents`、`/api/health`）
- 测试文件：`test_*.py`

**Node.js 侧（项目既有规范）：**
- 服务目录：`kebab-case`（`docx-bridge/`）
- 文件名：`kebab-case.ts`（`process-manager.ts`、`render-client.ts`）
- 导出名：`camelCase`（`docxBridgeService`）
- IPC 通道：`domain:action`（`docx:render`、`docx:health`）

### Project Structure Notes

新增文件：
```
python/                                                    ← 全新 Python 项目
├── pyproject.toml
├── requirements.txt
├── src/
│   └── docx_renderer/
│       ├── __init__.py
│       ├── __main__.py
│       ├── app.py
│       ├── routes/
│       │   ├── __init__.py
│       │   ├── health.py
│       │   ├── render.py
│       │   └── shutdown.py
│       ├── engine/
│       │   ├── __init__.py
│       │   └── renderer.py
│       └── models/
│           ├── __init__.py
│           └── schemas.py
└── tests/
    ├── conftest.py
    ├── fixtures/
    │   ├── sample.md
    │   └── template.docx
    ├── test_health.py
    ├── test_render.py
    ├── test_shutdown.py
    └── test_engine.py

src/shared/docx-types.ts                                   ← 共享类型
src/main/services/docx-bridge/
├── index.ts                                               ← 服务门面
├── process-manager.ts                                     ← Python 进程生命周期管理
└── render-client.ts                                       ← HTTP 客户端
src/main/ipc/docx-bridge-handlers.ts                       ← IPC 处理器
tests/unit/main/services/docx-bridge-process-manager.test.ts
tests/unit/main/services/docx-bridge-render-client.test.ts
tests/unit/main/services/docx-bridge-service.test.ts
tests/unit/main/ipc/docx-bridge-handlers.test.ts
tests/unit/main/index.test.ts
tests/integration/docx-bridge/bridge-integration.test.ts
```

修改文件：
```
.gitignore                                                 ← 添加 Python 条目
src/shared/ipc-types.ts                                    ← 注册 IPC 通道
src/shared/constants.ts                                    ← 添加错误码
src/main/utils/errors.ts                                   ← 添加 DocxBridgeError
src/main/ipc/index.ts                                      ← 注册 handler
src/preload/index.ts                                       ← 添加 preload bridge
src/main/index.ts                                          ← 添加启动/关闭钩子
tests/unit/preload/security.test.ts                        ← 更新安全白名单
```

### 必须复用的现有基础设施（禁止重复创建）

- `createIpcHandler` — IPC handler 工厂函数（`src/main/ipc/create-handler.ts`）
- `IPC_CHANNELS` / `IpcChannelMap` — 通道常量和类型映射（`src/shared/ipc-types.ts`）
- `ErrorCode` 枚举 — 错误码常量（`src/shared/constants.ts`）
- `BidWiseError` — 类型化错误基类（`src/main/utils/errors.ts`）
- `createLogger` — 日志工厂（`src/main/utils/logger.ts`）
- `resolveProjectDataPath` — 项目路径解析（`src/main/utils/project-paths.ts`）
- `ApiResponse` 类型 — 统一响应包装器（`src/shared/ipc-types.ts`）

### 现有 IPC 模式参考

遵循 `drawio-handlers.ts` 建立的模式（Story 3-7 验证）：

```typescript
// 1. 域通道类型
type DocxBridgeChannel = Extract<IpcChannel, `docx:${string}`>

// 2. Handler map（编译时穷举检查）
const docxBridgeHandlerMap: { [C in DocxBridgeChannel]: () => void } = {
  'docx:render': () => createIpcHandler('docx:render', (input) => docxBridgeService.renderDocx(input)),
  'docx:health': () => createIpcHandler('docx:health', () => docxBridgeService.getHealth()),
}

// 3. 导出类型 + 注册函数
export type RegisteredDocxBridgeChannels = DocxBridgeChannel
export function registerDocxBridgeHandlers(): void { ... }
```

### 错误处理策略

| 错误场景 | Python 侧处理 | Node.js 侧处理 |
|---|---|---|
| 模板文件不存在 | `ErrorResponse(code="TEMPLATE_NOT_FOUND")` | 透传给 IPC 调用方 |
| 模板文件无效 | `ErrorResponse(code="DOCX_TEMPLATE_INVALID")` | 透传给 IPC 调用方 |
| Markdown 解析失败 | `ErrorResponse(code="DOCX_RENDER_FAILED")` | 包装为 `DocxBridgeError` |
| Python 进程未启动 | N/A | `DocxBridgeError(DOCX_BRIDGE_UNAVAILABLE)` |
| HTTP 请求超时 | N/A | `DocxBridgeError(DOCX_RENDER_FAILED)` |
| 进程意外退出 | N/A | 自动重启 + 日志记录 |

### 禁止事项

1. 不得将 Python 渲染逻辑放在 Node.js 主进程中（必须独立 Python 进程）
2. 不得在 IPC handler 中写业务逻辑（薄分发模式）
3. 不得硬编码端口号（必须动态分配）
4. 不得使用 WebSocket 替代 HTTP（架构决策 D2b 确定为 HTTP）
5. 不得 throw 裸字符串（Python 用自定义异常 + ErrorResponse，Node 用 BidWiseError）
6. 不得使用深层相对路径导入（禁止 `../../`）
7. 不得在渲染进程直接调用 Python 进程（必须经由主进程 docx-bridge）
8. 不得在 Python 代码中使用全局状态（FastAPI 应用无状态，每个请求独立）
9. 不得引入 axios/node-fetch（使用 Node.js 内置 fetch）
10. 不得跳过统一响应格式（Python + Node 必须使用 `{ success, data, error }` wrapper）
11. 不得在 Alpha 阶段实现完整 Markdown 解析（基础元素即可）
12. 不得让 Python 进程启动失败阻塞 Electron 应用启动（降级为不可用状态）
13. 不得让 renderer 控制任意文件写入路径（输出必须限制在项目 `exports/`）

### 与后续 Story 的衔接

| 后续 Story | 消费本 Story 的 | 扩展方向 |
|---|---|---|
| 8-2 导出前预览 | docx-bridge 渲染能力 | 添加预览专用端点/参数 |
| 8-3 一键导出 | 完整渲染链路 + 模板映射 | 扩展渲染引擎的样式映射能力 |
| 8-4 draw.io PNG + 图表编号 | 渲染引擎基础设施 | 添加图片插入和编号端点 |
| 8-5 格式降级 + 合规报告 | 错误处理框架 | 扩展渲染引擎的格式检测能力 |

### OpenAPI 自动文档

FastAPI 自带 OpenAPI 文档（`/docs` Swagger UI、`/redoc` ReDoc），便于调试和 LLM 辅助开发：
- 开发时可在浏览器访问 `http://localhost:{port}/docs` 查看所有端点
- 自动生成 JSON Schema 供主进程参考
- 这是架构决策的明确优势之一

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.1] — 用户故事和验收标准
- [Source: _bmad-output/planning-artifacts/architecture.md#D2b] — Python 进程通信决策：FastAPI over localhost HTTP
- [Source: _bmad-output/planning-artifacts/architecture.md#Python 进程启动协议] — READY 信号、健康检查、自动重启
- [Source: _bmad-output/planning-artifacts/architecture.md#通信架构] — 三进程通信模式
- [Source: _bmad-output/planning-artifacts/architecture.md#统一 Response Wrapper] — IPC + FastAPI 共用格式
- [Source: _bmad-output/planning-artifacts/architecture.md#命名模式] — Python PEP 8、FastAPI kebab-case
- [Source: _bmad-output/planning-artifacts/architecture.md#强制规则] — 所有强制规则和反模式
- [Source: _bmad-output/planning-artifacts/architecture.md#完整项目目录结构] — python/ 目录结构、docx-bridge/ 目录
- [Source: _bmad-output/planning-artifacts/architecture.md#Alpha/Beta/RC] — docx-bridge 属于 Alpha 服务
- [Source: _bmad-output/planning-artifacts/architecture.md#异步任务白名单] — 用户可见 docx 导出必须走 task-queue
- [Source: _bmad-output/planning-artifacts/prd.md#FR53-FR58] — 交付与导出功能需求
- [Source: _bmad-output/planning-artifacts/prd.md#NFR5,NFR16,NFR27,NFR28] — 导出性能/完整性/独立升级/跨平台一致性
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Stage 6] — 导出流程 UX：预览→格式检查→一键导出
- [Source: https://pypi.org/pypi/python-docx/json] — 2026-04-08 依赖版本复核
- [Source: https://pypi.org/pypi/fastapi/json] — 2026-04-08 依赖版本复核
- [Source: https://pypi.org/pypi/uvicorn/json] — 2026-04-08 依赖版本复核
- [Source: https://pypi.org/pypi/pydantic/json] — 2026-04-08 依赖版本复核
- [Source: https://pypi.org/pypi/pytest/json] — 2026-04-08 依赖版本复核
- [Source: https://pypi.org/pypi/httpx/json] — 2026-04-08 依赖版本复核

## Change Log

- 2026-04-08: Story 实现完成（dev-story）
  - 全部 13 个 Task 及子任务已实现并验证
  - Python 21 项测试 + Node.js 1368 项单元测试 + 59 项 E2E 测试全部通过
  - lint + typecheck + build 通过
  - 修复 lint 错误：docx-bridge-process-manager.test.ts 缺少返回类型注解
- 2026-04-08: `create-story` 复核修正
  - 修正 Node.js 侧单元测试路径，对齐当前仓库目录规范：服务测试 → `tests/unit/main/services/`，IPC handler 测试 → `tests/unit/main/ipc/`
  - 修正 preload 安全测试路径：`tests/unit/main/preload-security.test.ts` → `tests/unit/preload/security.test.ts`（现有文件更新，非新建）
  - 在"修改文件"清单中补充 `tests/unit/preload/security.test.ts`
- 2026-04-08: `validate-create-story` 复核修正
  - 明确 READY 协议需预绑定 socket 后回报实际端口，host 固定 `127.0.0.1`
  - 补齐 `/api/shutdown` 路由、测试和退出流程，消除 AC7 与任务树不一致
  - 明确 Python HTTP JSON 使用 camelCase alias，与 TypeScript IPC 类型对齐
  - 修正 `docx:health` 为 void input，避免 preload 派生类型实现错误
  - 将模板缺失与模板无效错误码拆开，复用现有 `TEMPLATE_NOT_FOUND`
  - 补齐 `outputPath` 安全边界，限制写入项目 `exports/`
  - 将 Electron 启动策略改为后台启动 docx-bridge，避免 Python 重试阻塞窗口创建
  - 明确 8.1 的 `docx:render` 是烟雾通道，用户可见 docx 导出仍必须由后续 Story 通过 task-queue 封装

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Debug Log References

- Lint 修复: `tests/unit/main/services/docx-bridge-process-manager.test.ts:33` — 添加 eslint-disable 注释修复 `@typescript-eslint/explicit-function-return-type` 规则

### Completion Notes List

- ✅ Python FastAPI 渲染引擎完整实现：app.py（READY 协议 + socket 预绑定）、health/render/shutdown 路由、Markdown→docx 基础渲染引擎、Pydantic camelCase 模型
- ✅ Node.js docx-bridge 三层架构：ProcessManager（进程启动/重试/健康检查/重启/优雅关闭）、RenderClient（HTTP 通信 + 超时）、Service 门面（路径安全校验 + exports/ 限定）
- ✅ IPC 通道注册：docx:render + docx:health，薄分发模式，编译时穷举检查
- ✅ Preload bridge 添加：docxRender + docxHealth
- ✅ 主进程集成：后台启动 docx-bridge（不阻塞 createWindow），will-quit 优雅关闭
- ✅ 共享类型 + 错误码：RenderDocxInput/Output、DocxHealthData、DocxBridgeStatus、DocxBridgeError
- ✅ Python 21 项测试全部通过（test_health/test_render/test_engine/test_shutdown）
- ✅ Node.js 1368 项单元测试 + 59 项 E2E 测试全部通过，零回归
- ✅ Lint、TypeScript 类型检查、生产构建全部通过

### File List

新增文件：
- `python/pyproject.toml`
- `python/requirements.txt`
- `python/src/docx_renderer/__init__.py`
- `python/src/docx_renderer/__main__.py`
- `python/src/docx_renderer/app.py`
- `python/src/docx_renderer/routes/__init__.py`
- `python/src/docx_renderer/routes/health.py`
- `python/src/docx_renderer/routes/render.py`
- `python/src/docx_renderer/routes/shutdown.py`
- `python/src/docx_renderer/engine/__init__.py`
- `python/src/docx_renderer/engine/renderer.py`
- `python/src/docx_renderer/models/__init__.py`
- `python/src/docx_renderer/models/schemas.py`
- `python/tests/conftest.py`
- `python/tests/fixtures/sample.md`
- `python/tests/fixtures/template.docx`
- `python/tests/test_health.py`
- `python/tests/test_render.py`
- `python/tests/test_shutdown.py`
- `python/tests/test_engine.py`
- `src/shared/docx-types.ts`
- `src/main/services/docx-bridge/index.ts`
- `src/main/services/docx-bridge/process-manager.ts`
- `src/main/services/docx-bridge/render-client.ts`
- `src/main/ipc/docx-bridge-handlers.ts`
- `tests/unit/main/services/docx-bridge-process-manager.test.ts`
- `tests/unit/main/services/docx-bridge-render-client.test.ts`
- `tests/unit/main/services/docx-bridge-service.test.ts`
- `tests/unit/main/ipc/docx-bridge-handlers.test.ts`
- `tests/integration/docx-bridge/bridge-integration.test.ts`

修改文件：
- `.gitignore` — 添加 Python 条目
- `src/shared/ipc-types.ts` — 注册 docx:render/docx:health IPC 通道 + 类型映射
- `src/shared/constants.ts` — 添加 DOCX_RENDER_FAILED/DOCX_BRIDGE_UNAVAILABLE/DOCX_TEMPLATE_INVALID 错误码
- `src/main/utils/errors.ts` — 添加 DocxBridgeError extends BidWiseError
- `src/main/ipc/index.ts` — 注册 docx-bridge handlers + RegisteredDocxBridgeChannels 类型
- `src/preload/index.ts` — 添加 docxRender/docxHealth preload bridge
- `src/main/index.ts` — 后台启动 docxBridgeService + will-quit 关闭
- `tests/unit/preload/security.test.ts` — 安全白名单包含 docx 通道
