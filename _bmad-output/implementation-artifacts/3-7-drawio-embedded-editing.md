# Story 3.7: draw.io 架构图内嵌编辑

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want 在编辑器中直接内嵌编辑 draw.io 架构图,
So that 不用切换工具，架构图与方案内容在同一工作台管理。

## Acceptance Criteria

1. **Given** 方案编辑过程中 **When** 用户通过编辑器工具栏触发"插入架构图" **Then** 在当前光标位置插入一个 draw.io 空白图编辑区块，draw.io 编辑器通过 iframe 嵌入，用户可立即开始绘图（FR25）

2. **Given** draw.io 编辑器已嵌入 **When** 用户编辑架构图并保存 **Then** 编辑状态通过 draw.io 的 JSON-string `postMessage` 协议与 Plate void element 的运行时节点数据同步，持久化事实来源写入项目 `assets/` 目录中的 `.drawio` 源文件与同 basename 的 `.png` 预览图（FR25）

3. **Given** draw.io 预览区块已存在 **When** 用户双击 PNG 缩略图或点击"编辑"按钮 **Then** draw.io 编辑器以 iframe 形式重新展开并回填已有图表数据，用户可继续编辑

4. **Given** draw.io 编辑器处于活跃状态 **When** 用户完成编辑（保存后关闭，或确认放弃未保存修改后关闭） **Then** iframe 收起为静态 PNG 预览缩略图，缩略图嵌入在文档流中，图表数据保存到运行时 void element 与 assets 目录

5. **Given** 方案包含 draw.io 图表 **When** 编辑器序列化为 Markdown **Then** draw.io 区块序列化为 `<!-- drawio:diagramId:assetFileName.drawio -->` + 标准 Markdown 图片语法 `![caption](assets/xxx.png)`，保持 Markdown 纯净可读（架构决策 D5）

6. **Given** 方案包含 draw.io 图表 **When** 重新打开方案 **Then** 编辑器反序列化 Markdown 时同步识别 `drawio` 注释 + 图片组合并恢复为可编辑的 void element 占位区块，再由组件层按需加载 XML / PNG 预览数据

7. **Given** draw.io 编辑器嵌入 **When** iframe 加载 **Then** 父级 renderer CSP 仅新增 `frame-src https://embed.diagrams.net`，iframe `sandbox` 与 `contextBridge` 共同保证不暴露 Electron Node.js API，且只接受 `https://embed.diagrams.net` 的消息

8. **Given** draw.io 预览区块已存在 **When** 用户点击预览态中的"删除"按钮 **Then** 文档中的 draw.io void element 被移除，并通过 IPC 删除对应的 `.drawio` / `.png` 资产文件

## Tasks / Subtasks

### 共享类型定义

- [ ] Task 1: 定义 draw.io 元素与 IPC 类型（AC: #1, #2, #4, #5, #8）
  - [ ] 1.1 新建 `src/shared/drawio-types.ts`
  - [ ] 1.2 定义 `DrawioElementData` 接口：
    ```typescript
    interface DrawioElementData {
      diagramId: string        // UUID，标识该图表实例
      xml?: string             // 当前会话中的 draw.io XML 数据；重新打开后按需从 assets 目录回填
      pngDataUrl?: string      // base64 PNG 缩略图（当前会话预览态使用）
      assetFileName: string    // assets 目录中的文件名，如 'arch-diagram.drawio'
      caption: string          // 图表标题/说明
      lastModified?: string    // ISO-8601 时间戳；Markdown 同步反序列化的占位节点可暂缺
    }
    // 注意：Markdown 反序列化阶段恢复的是占位节点，因此 `xml` / `pngDataUrl` / `lastModified`
    // 可能暂时缺失，后续由 DrawioElement 组件懒加载补回
    ```
  - [ ] 1.3 定义 draw.io postMessage 协议类型：
    ```typescript
    type DrawioAction = 'load' | 'export'
    type DrawioEvent = 'init' | 'save' | 'export' | 'exit'
    interface DrawioMessagePayload {
      event: DrawioEvent
      xml?: string
      data?: string
      modified?: boolean
      bounds?: unknown
    }
    interface DrawioCommandPayload {
      action: DrawioAction
      xml?: string
      format?: 'png'
      spin?: boolean
      [key: string]: unknown
    }
    // message event 的 data 为 JSON string；接收端必须 safe-parse 后再判别 event
    ```
  - [ ] 1.4 定义 IPC 类型：
    - `SaveDrawioAssetInput { projectId: string; diagramId: string; xml: string; pngBase64: string; fileName: string }`
    - `SaveDrawioAssetOutput { assetPath: string; pngPath: string }`
    - `LoadDrawioAssetInput { projectId: string; fileName: string }`
    - `LoadDrawioAssetOutput { xml: string; pngDataUrl: string } | null`
    - `DeleteDrawioAssetInput { projectId: string; fileName: string }`

### Plate.js Void Element 插件

- [ ] Task 2: 创建 draw.io 自定义 Void Element 插件（AC: #1, #3, #4, #6）
  - [ ] 2.1 新建 `src/renderer/src/modules/editor/plugins/drawioPlugin.ts`
  - [ ] 2.2 使用 Plate.js v52 API 创建 `DrawioPlugin`：
    - 注册自定义 element type `drawio`
    - 通过 `createPlatePlugin(...)` / 当前 v52 等效 API 标记为块级 `isVoid: true`
    - 定义 node 数据结构继承 `DrawioElementData`
  - [ ] 2.3 在 `editorPlugins.ts` 中注册 `DrawioPlugin`（追加到插件数组末尾，不影响现有插件顺序）
  - [ ] 2.4 单测验证插件注册成功、void element 属性正确

### draw.io iframe 嵌入组件

- [ ] Task 3: 创建 draw.io 编辑器 iframe 容器组件（AC: #1, #2, #3, #4, #7）
  - [ ] 3.1 新建 `src/renderer/src/modules/editor/components/DrawioEditor.tsx`
  - [ ] 3.2 实现 iframe 加载逻辑：
    - 生产环境使用 draw.io embed mode URL：`https://embed.diagrams.net/?embed=1&proto=json&spin=1&libraries=1`
    - 为单元测试 / E2E 提供本地可覆盖的 iframe URL 解析点，禁止测试直接依赖外部网络
    - iframe 设置 `sandbox="allow-scripts allow-same-origin allow-popups"` 安全策略
    - iframe 尺寸：宽度 100%，Alpha 阶段固定高度 500px，不实现拖拽改高
    - 编辑态截图中的保存 / 关闭控件优先复用 draw.io embed mode 原生 Save / Exit 按钮；宿主层只负责容器边框、安全沙箱标识和预览态操作栏，禁止再叠加一套重复按钮
  - [ ] 3.3 实现 postMessage 通信协议：
    - `init` 事件：iframe 就绪后向 `https://embed.diagrams.net` 发送 `JSON.stringify({ action: 'load', xml })`
    - `save` 事件：安全解析 XML 后立即触发 `JSON.stringify({ action: 'export', format: 'png', spin: true })`
    - `export` 事件：接收 PNG base64 数据后，先通过 `window.api.drawioSaveAsset(...)` 持久化 `.drawio` + `.png`；仅当 `ApiResponse.success === true` 时才更新节点数据（`xml` / `pngDataUrl` / `lastModified`）并允许收起到预览态
    - `exit` 事件：若 `modified === true` 且本轮未成功保存，先确认是否放弃未保存修改；确认后切换到预览模式
    - 所有 message handler 先校验 `event.origin === 'https://embed.diagrams.net'`，再 safe-parse `event.data`
    - 保存失败时保持编辑态，不覆盖最近一次成功保存的预览图，使用现有 Ant Design `message.error` / inline error 提示用户重试
  - [ ] 3.4 实现编辑/预览模式切换：
    - 预览模式：显示 PNG 缩略图 + 图表标题 + "编辑"/"删除"按钮
    - 编辑模式：展开 iframe，隐藏缩略图
    - 双击缩略图 或 点击"编辑"按钮进入编辑模式
  - [ ] 3.5 实现图表标题编辑：inline 可编辑文本，blur 时保存到 `caption` 字段
  - [ ] 3.6 样式使用 Tailwind CSS（与编辑器层一致）；图标优先复用 `@ant-design/icons` / 现有 shared icon 体系，不为本 Story 新增 `lucide-react`

### Void Element 渲染组件

- [ ] Task 4: 创建 Plate void element 渲染组件（AC: #1, #3, #4, #6, #8）
  - [ ] 4.1 新建 `src/renderer/src/modules/editor/components/DrawioElement.tsx`
  - [ ] 4.2 实现 Plate element component：
    - 包裹 `DrawioEditor` 组件
    - 通过 Plate element props 读取/写入 `DrawioElementData`
    - 通过 `useProjectStore((s) => s.currentProject?.id)` 获取当前 `projectId`，禁止把 `projectId` 持久化到节点数据
    - 组件层在 `xml` / `pngDataUrl` 缺失时按需调用 `window.api.drawioLoadAsset(...)` 补回数据；renderer 必须按现有 preload 约定先判断 `ApiResponse.success` 再读取 `data`，`deserializeFromMarkdown()` 保持同步
    - 若 `drawioLoadAsset(...)` 返回 `success: true, data: null` 或读取失败，组件必须渲染非崩溃的 warning placeholder（保留标题 / 编辑 / 删除入口），不得让整个编辑器树因资产缺失而报错
    - 使用当前 Plate v52 transform API 更新节点数据与删除节点
    - 处理选中态视觉反馈（蓝色边框）
    - 删除按钮点击后：先删除节点，再调用 `window.api.drawioDeleteAsset(...)` 做 best-effort 资产删除；若资产删除失败，仅记录 warning / 非阻塞提示，不回滚文档删除
  - [ ] 4.3 在 `DrawioPlugin` 中通过 `.withComponent(DrawioElement)` 绑定渲染组件
  - [ ] 4.4 单测验证：void element 渲染、懒加载回填、数据读写、模式切换、删除动作

### 主进程资产服务

- [ ] Task 5: 实现 draw.io 文件存储 IPC 服务（AC: #2, #6, #8）
  - [ ] 5.1 新建 `src/main/services/drawio-asset-service.ts`
  - [ ] 5.2 实现 `saveDrawioAsset(input: SaveDrawioAssetInput): Promise<SaveDrawioAssetOutput>`
    - 使用 `resolveProjectDataPath(projectId)` 解析项目目录，禁止手写 `data/projects/...` 路径
    - 将 XML 写入 `{projectRoot}/assets/{fileName}` （`.drawio` 格式）
    - 将 PNG base64 解码写入同 basename 的 `{projectRoot}/assets/{fileNameWithoutDrawio}.png`
    - 参考 `document-service.ts` 的原子写入风格与 `project-service.ts` 的目录初始化模式；当前仓库不存在 `src/main/utils/file-utils.ts`
    - 确保 `assets/` 目录存在（`mkdir(..., { recursive: true })`）
  - [ ] 5.3 实现 `loadDrawioAsset(input: LoadDrawioAssetInput): Promise<LoadDrawioAssetOutput | null>`
    - 读取 .drawio 文件获取 XML
    - 读取同 basename 的 `.png` 文件转换为 base64 data URL
    - 文件不存在时返回 null
  - [ ] 5.4 实现 `deleteDrawioAsset(input: DeleteDrawioAssetInput): Promise<void>`
    - 删除 `.drawio` 和同 basename 的 `.png` 文件（不存在时 best-effort）
  - [ ] 5.5 单测覆盖：保存/加载/删除、目录创建、文件不存在处理

### IPC 通道与 Preload

- [ ] Task 6: 注册 draw.io 资产 IPC 通道（AC: #2, #6, #8）
  - [ ] 6.1 在 `src/shared/ipc-types.ts` 新增 IPC 通道常量和类型映射：
    - `DRAWIO_SAVE_ASSET: 'drawio:save-asset'`
    - `DRAWIO_LOAD_ASSET: 'drawio:load-asset'`
    - `DRAWIO_DELETE_ASSET: 'drawio:delete-asset'`
  - [ ] 6.2 新建 `src/main/ipc/drawio-handlers.ts`，使用 `createIpcHandler` 薄分发到 `drawioAssetService`
  - [ ] 6.3 在 `src/main/ipc/index.ts` 注册新 handler
  - [ ] 6.4 在 `src/preload/index.ts` 的 `requestApi` 中暴露：
    - `drawioSaveAsset(input)`
    - `drawioLoadAsset(input)`
    - `drawioDeleteAsset(input)`
  - [ ] 6.5 更新 `tests/unit/preload/security.test.ts` 白名单

### Markdown 序列化扩展

- [ ] Task 7: 扩展 Markdown 序列化支持 draw.io 区块（AC: #5, #6）
  - [ ] 7.1 修改 `src/renderer/src/modules/editor/serializer/markdownSerializer.ts`
  - [ ] 7.2 保持 `deserializeFromMarkdown()` / `serializeToMarkdown()` 为同步 API；禁止在反序列化阶段直接发起异步 IPC
  - [ ] 7.3 序列化规则：将 `drawio` void element 序列化为：
    ```markdown
    <!-- drawio:diagram-id:asset-file-name -->
    ![caption](assets/preview-file-name.png)
    ```
    - HTML 注释行存储 diagramId 和 assetFileName（反序列化需要）
    - 图片行保持标准 Markdown 语法（纯净可读，符合 D5 决策）
    - 非 draw.io 节点继续委托 `editor.api.markdown.serialize(...)` 处理，避免重写现有 Markdown 栈
  - [ ] 7.4 反序列化规则：同步识别 `<!-- drawio:... -->` + `![...](assets/...png)` 组合模式
    - 解析 diagramId、assetFileName 与 caption
    - 创建 `drawio` void element 占位节点（先只回填 diagramId / assetFileName / caption）
    - XML / PNG 缩略图由 `DrawioElement` 组件在 mount / reopen 时按需异步加载
  - [ ] 7.5 fallback：当 HTML 注释缺失、格式非法或图片路径不匹配时，普通图片仍按标准 `img` 渲染，不误识别为 draw.io
  - [ ] 7.6 单测覆盖：序列化/反序列化往返一致性、fallback、边界情况、同步占位 + 组件层懒加载契约

### 插入图表入口

- [ ] Task 8: 在编辑器工具栏添加"插入架构图"按钮（AC: #1, #8）
  - [ ] 8.1 修改 `src/renderer/src/modules/editor/components/EditorToolbar.tsx`
    - 在工具栏左侧区域添加"插入架构图"按钮（图标 + 文字）
    - 使用现有项目图标体系（如 `@ant-design/icons` 中的结构/部署类图标），不得新增 `lucide-react`
    - 右侧保留 `WritingStyleSelector`；本 Story 不要求补齐完整格式化工具栏，PNG 中的格式按钮视为上下文示意
  - [ ] 8.2 修改 `src/renderer/src/modules/editor/components/PlateEditor.tsx` 与 `EditorView.tsx`
    - 由于 `EditorToolbar` 目前位于 `Plate` Provider 之外，新增 `onInsertDrawioReady` 之类的回调契约，把插入函数从 `PlateEditor` 注册到 `EditorView` 再传给 toolbar
    - `PlateEditor` 维护最近一次非空 selection；toolbar 按钮使用 `onMouseDown={e => e.preventDefault()}` 保持插入位置不因 toolbar click 丢失
    - 插入函数使用当前 Plate transform API 插入空白 draw.io void element，并自动生成 `diagramId`（UUID）和默认 `assetFileName`（`diagram-{short-id}.drawio`）
  - [ ] 8.3 按钮仅在编辑器有可用插入位置时启用；无焦点 / 无可用 selection 时 disabled
  - [ ] 8.4 单测覆盖：按钮渲染、点击插入、selection 保持、disabled 状态、`EditorView`/`PlateEditor` 新回调合同不破坏既有 flush/replace 合同

### 测试

- [ ] Task 9: 单元测试、集成测试与 E2E（AC: #1-#8）
  - [ ] 9.1 `tests/unit/renderer/modules/editor/plugins/drawioPlugin.test.ts` — 插件注册、void element 属性
  - [ ] 9.2 `tests/unit/renderer/modules/editor/components/DrawioElement.test.tsx` — void element 渲染、懒加载、资产缺失 fallback、删除动作、删除失败 warning、数据绑定
  - [ ] 9.3 `tests/unit/renderer/modules/editor/components/DrawioEditor.test.tsx` — iframe 通信、JSON parse/stringify、模式切换、discard confirm、安全策略、保存失败保持编辑态
  - [ ] 9.4 `tests/unit/renderer/modules/editor/serializer/markdownSerializer.test.ts` — 同步序列化/反序列化、fallback、drawio block 占位恢复
  - [ ] 9.5 `tests/unit/main/services/drawio-asset-service.test.ts` — 文件存储 CRUD
  - [ ] 9.6 `tests/unit/main/ipc/drawio-handlers.test.ts` — IPC 通道注册与分发
  - [ ] 9.7 `tests/unit/preload/security.test.ts` — preload 白名单更新
  - [ ] 9.8 `tests/unit/renderer/modules/editor/components/PlateEditor.test.tsx` / `EditorView.test.tsx` — 新增插入回调注册合同与 toolbar 接线
  - [ ] 9.9 验证 `src/renderer/index.html` 的 CSP 放开 `frame-src https://embed.diagrams.net`，同时保持 `default-src 'self'`
  - [ ] 9.10 `tests/e2e/stories/story-3-7-drawio-editing.spec.ts` — 插入图表→编辑→保存→重新打开→验证数据持久化；E2E 必须使用本地 mock iframe / 可覆盖 embed URL，不依赖外网
  - [ ] 9.11 `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` 全部通过

## Dev Notes

### 本 Story 在 Epic 3 中的位置

```
Story 3.1 (done): Plate 编辑器 + Markdown 序列化
Story 3.2 (done): 编辑器嵌入工作空间 + 文档大纲
Story 3.3 (done): 模板驱动方案骨架生成
Story 3.4 (done): AI 章节级方案生成
Story 3.5 (done): AI 内容来源标注与基线交叉验证
Story 3.6 (done): 文风模板与军工用语控制
→ Story 3.7 (本 Story): draw.io 架构图内嵌编辑
Story 3.8 (next): Mermaid 架构图草图生成
```

本 Story 是 Epic 3 编辑器能力的"可视化层"。前 6 个 Story 建立了完整的文本编辑链路（Plate 编辑器→Markdown 序列化→模板骨架→AI 生成→来源标注→文风控制），本 Story 在编辑器中增加架构图内嵌编辑能力，让售前工程师无需切换工具即可在方案中管理架构图。

### 核心技术方案：iframe + postMessage

draw.io 提供官方的 embed mode，通过 iframe 加载并使用 postMessage JSON 协议通信：

**通信流程：**
```
1. 渲染进程创建 iframe → 加载 https://embed.diagrams.net/?embed=1&proto=json&spin=1&libraries=1
2. iframe 就绪 → 向父窗口发送 JSON string，safe-parse 后得到 `{ event: 'init' }`
3. 父窗口收到 init → 向 `https://embed.diagrams.net` 发送 `JSON.stringify({ action: 'load', xml })`
4. 用户编辑完成点击保存 → iframe 发送 `{"event":"save","xml":"..."}`
5. 父窗口收到 save → 发送 `JSON.stringify({ action: 'export', format: 'png', spin: true })`
6. iframe 返回 `{"event":"export","data":"base64..."}` → 更新当前运行时节点数据
7. renderer 通过 IPC 将 `.drawio` XML 与 sibling `.png` 预览图持久化到 assets 目录
8. 用户退出 → iframe 发送 `{"event":"exit","modified":boolean}`；若存在未保存修改则先确认再收起为 PNG 预览态
```

**安全约束：**
- iframe `sandbox` 属性限制权限
- 只接受 `event.origin === 'https://embed.diagrams.net'` 的消息，并使用 exact `targetOrigin`
- 不使用 Electron webview（避免 Node.js API 泄露），使用标准 HTML iframe
- CSP 通过 `src/renderer/index.html` 的 `<meta http-equiv="Content-Security-Policy">` 调整 `frame-src`，不是在 `webPreferences` 中声明

### 数据流

```
用户点击"插入架构图"
  ↓
EditorToolbar(onMouseDown preventDefault) → 调用 PlateEditor 暴露的 insertDrawio callback
  ↓
DrawioElement 渲染 → 自动进入编辑模式 → 加载 DrawioEditor iframe
  ↓
用户在 draw.io 中绘图 → 点击保存
  ↓
iframe postMessage(JSON string) → safe-parse 为 { event: 'save', xml: '...' }
  ↓
DrawioEditor 接收 → 发送 JSON.stringify({ action: 'export', format: 'png' })
  ↓
iframe postMessage(JSON string) → safe-parse 为 { event: 'export', data: 'base64png...' }
  ↓
DrawioEditor → 更新 Plate node data（xml + pngDataUrl）
  ↓ 同时
IPC: drawio:save-asset → drawio-handlers.ts（薄分发）
  ↓
drawioAssetService.saveDrawioAsset({ projectId, diagramId, xml, pngBase64, fileName })
  ↓
写入 {projectRoot}/assets/diagram-xxx.drawio + diagram-xxx.png
  ↓
编辑器自动保存 → Markdown 序列化 → proposal.md 中生成图片引用
```

### Markdown 序列化策略（架构决策 D5 合规）

架构决策 D5 要求 Markdown 100% 标准可读，元数据通过辅助手段引用。draw.io 图表序列化方案：

```markdown
<!-- drawio:550e8400-e29b-41d4-a716-446655440000:arch-diagram.drawio -->
![系统架构图](assets/arch-diagram.png)
```

- 第一行 HTML 注释：存储 `diagramId` 和 `assetFileName`，用于反序列化时恢复可编辑状态
- 第二行标准图片：确保任何 Markdown 查看器都能显示图片
- HTML 注释是标准 Markdown 语法，不破坏兼容性
- `.drawio` 源文件和同 basename 的 `.png` 预览图始终成对存在于 assets 目录
- `deserializeFromMarkdown()` 必须保持同步：仅恢复占位 drawio 节点；XML / PNG 数据在组件层懒加载

### 已有基础设施（禁止重复实现）

| 组件 | 位置 | 用途 |
|------|------|------|
| editorPlugins | `src/renderer/src/modules/editor/plugins/editorPlugins.ts` | Plate 插件注册数组，本 Story 追加 DrawioPlugin |
| markdownSerializer | `src/renderer/src/modules/editor/serializer/markdownSerializer.ts` | Markdown 序列化/反序列化，本 Story 需扩展 |
| EditorView | `src/renderer/src/modules/editor/components/EditorView.tsx` | 编辑器容器，管理文档加载与自动保存 |
| PlateEditor | `src/renderer/src/modules/editor/components/PlateEditor.tsx` | Plate 编辑器核心，debounced 序列化 |
| EditorToolbar | `src/renderer/src/modules/editor/components/EditorToolbar.tsx` | Story 3.6 新增的工具栏容器，本 Story 添加插入按钮 |
| OutlineHeadingElement | `src/renderer/src/modules/editor/components/OutlineHeadingElement.tsx` | 自定义 element 组件参考模式 |
| SourceAwareParagraph | `src/renderer/src/modules/editor/components/SourceAwareParagraph.tsx` | 自定义 element 组件参考模式 |
| createIpcHandler | `src/main/ipc/create-handler.ts` | IPC handler 工厂函数 |
| IPC_CHANNELS / IpcChannelMap | `src/shared/ipc-types.ts` | IPC 常量与通道类型映射 |
| BidWiseError | `src/main/utils/errors.ts` | 类型化错误基类 |
| resolveProjectDataPath | `src/main/utils/project-paths.ts` | 项目 data 目录解析与 projectId 安全校验 |
| renderer CSP | `src/renderer/index.html` | 当前 renderer CSP 默认只允许 `'self'`，本 Story 需最小化放开 `frame-src https://embed.diagrams.net` |
| documentStore | `src/renderer/src/stores/documentStore.ts` | 方案文档状态管理 |
| Plate.js v52 | `@platejs/core@^52.3.4` | 编辑器框架 |
| CommandPalette / default commands | `src/renderer/src/shared/command-palette/*` | 当前全局命令面板基础设施已存在，但本 Story 的规范交付入口是 toolbar，不强制接入 command palette |

### 自定义 Element 模式参考

当前仓库中 Plate 自定义 element 的实现模式（基于 Story 3.1-3.6）：

```typescript
// 插件注册模式（editorPlugins.ts）
H1Plugin.withComponent(OutlineHeadingElement)
ParagraphPlugin.withComponent(SourceAwareParagraph)

// 自定义 element 组件模式（OutlineHeadingElement.tsx）
export function OutlineHeadingElement(props: PlateElementProps) {
  // 通过 props.element 读取节点数据
  // 通过 useEditorRef() 获取编辑器实例
  // 返回 JSX 包裹 PlateElement
}
```

draw.io void element 应遵循相同模式，但需标记为 `isVoid: true` 使 Plate 不在内部放置光标。

### 当前代码基线带来的实现约束

1. **EditorToolbar 当前位于 Plate 上下文之外**：`EditorView.tsx` 先渲染 `EditorToolbar`，再渲染 `PlateEditor`；因此 toolbar 不能直接调用 Plate hook，必须由 `PlateEditor` 注册插入回调并通过 `EditorView` 透传。
2. **markdownSerializer 当前是同步薄封装**：`PlateEditor` 在 `useMemo` 和替换章节逻辑中同步调用 `deserializeFromMarkdown()`；因此 draw.io 资产加载不能塞进反序列化流程，必须在 `DrawioElement` 组件层按需异步补回。
3. **renderer CSP 当前阻止远程 iframe**：`src/renderer/index.html` 只允许 `default-src 'self'`，本 Story 必须显式增加 `frame-src https://embed.diagrams.net`，否则 iframe 无法加载。
4. **项目已有图标体系是 Ant Design / shared icons**：Story 规范不得要求新增 `lucide-react`，否则会偏离当前依赖边界。

### 关键实现决策

**1. 使用 embed.diagrams.net 远程加载 draw.io**

- draw.io 官方提供免费的 embed mode，无需本地部署
- URL: `https://embed.diagrams.net/?embed=1&proto=json&spin=1&libraries=1`
- Electron 网络环境下直接可用
- 为测试提供本地 mock / 可覆盖 URL 入口，避免 CI 依赖外部网络
- 后续若需离线支持（RC 阶段），可替换为本地打包的 draw.io 静态资源

**2. PNG 缩略图双重存储**

- 运行时节点中存储 base64 PNG（`pngDataUrl`）：用于编辑态即时显示，避免每次渲染都读文件
- assets 目录存储 sibling `.png` 文件：用于 Markdown 图片引用和 docx 导出（Story 8-4）
- 该 PNG 在当前 Story 中主要承担编辑态/预览态缩略图职责；Story 8-4 会把同一路径的 sibling PNG 升级为导出可用的高清图
- 两处 PNG 始终同步更新

**3. Void Element 而非 Inline Element**

- 架构图是块级内容，独占一行，符合 Plate void element 语义
- void element 不允许内部光标，避免与 draw.io iframe 焦点冲突
- 遵循架构文档明确要求：「自定义 Void Element 包裹 draw.io iframe」

**4. 图表编号为占位符，导出时自动分配**

- UX 规范要求：「编辑态占位符标记，导出时按章节位置自动分配编号+交叉引用替换」
- 本 Story 不实现自动编号（属于 Story 8-4 导出流程）
- 图表 `caption` 字段仅存储用户输入的描述文本

**5. 不修改 PlateEditor 核心序列化流程**

- PlateEditor 的 `debounced serialization` 和 `requestIdleCallback` 逻辑不变
- 仅扩展 `markdownSerializer.ts` 的同步序列化/反序列化规则
- draw.io XML 数据在会话内通过 Plate node data 暂存；持久化后只输出 HTML 注释 + 标准图片引用
- draw.io 资产异步回填放在 `DrawioElement` / `DrawioEditor`，不塞进 `deserializeFromMarkdown()`

### 项目结构对齐

```
src/shared/
  drawio-types.ts                  ← draw.io 元素与 IPC 类型定义

src/main/
  services/
    drawio-asset-service.ts        ← draw.io 文件存储服务
  ipc/
    drawio-handlers.ts             ← IPC 薄分发
  utils/
    project-paths.ts               ← 复用：项目数据目录解析

src/renderer/src/
  modules/editor/
    plugins/
      drawioPlugin.ts              ← Plate void element 插件定义
    components/
      DrawioElement.tsx            ← Plate void element 渲染组件
      DrawioEditor.tsx             ← draw.io iframe 容器与 postMessage 通信
      EditorToolbar.tsx            ← 修改：添加"插入架构图"按钮
      PlateEditor.tsx              ← 修改：向 toolbar 注册 draw.io 插入回调
      EditorView.tsx               ← 修改：连接 toolbar ↔ PlateEditor 回调
    serializer/
      markdownSerializer.ts        ← 修改：扩展 draw.io 序列化/反序列化

src/renderer/
  index.html                       ← 修改：最小化放开 draw.io iframe 的 CSP frame-src

{userData}/data/projects/{project-id}/assets/
  *.drawio                         ← draw.io XML 源文件
  *.png                            ← 同 basename 的 PNG 预览图（编辑态 + 导出用）
```

### 前一 Story（3-6）关键学习

1. **EditorToolbar 已创建**：Story 3.6 新增了 `EditorToolbar.tsx` 容器，右侧放文风选择器。本 Story 在左侧区域添加"插入架构图"按钮
2. **Plate 插件追加模式**：在 `editorPlugins` 数组末尾追加新插件，不影响现有插件顺序
3. **ProposalMetadata 扩展方式**：新增可选字段 + `normalizeMetadata()` 默认值
4. **IPC handler 薄分发模式**：handler 只做参数解析和 service 委托
5. **preload 白名单安全测试**：新增 IPC 通道必须更新 `security.test.ts`
6. **PlateEditor 合同**：`onSyncFlushReady` / `onReplaceSectionReady` 合同不变；如需新增 draw.io 插入回调，只能新增可选契约，不能破坏既有调用者
7. **Toolbar 假按钮禁令继续有效**：参考 Story 3.6 的验证结论，PNG 中出现的格式化按钮仅作视觉上下文，不得为了对齐原型新增未接线的假功能

### 与 Story 8-4 的关系

Story 8-4（draw.io 自动转 PNG + 图表编号）是导出阶段的功能，依赖本 Story 建立的 draw.io 存储基础：
- 本 Story 提供：`.drawio` 源文件 + sibling `.png` 预览图存储在 assets 目录
- Story 8-4 消费：导出时直接消费 sibling `.png` 资产，并通过 `DrawioEditor` 的 `scale: 2` 保存链路逐步升级为高清 PNG，再自动分配图表编号

### 禁止事项

- **禁止**使用 Electron `webview` 标签（安全风险，使用标准 iframe）
- **禁止**在 IPC handler 中放置业务逻辑（委托给 `drawioAssetService`）
- **禁止**在 renderer 直接读写文件系统（统一经 main-process IPC）
- **禁止**在 `deserializeFromMarkdown()` 中直接发起异步 IPC（当前编辑器链路要求同步）
- **禁止**用宽松字符串包含判断校验消息来源（必须 exact-match `https://embed.diagrams.net`）
- **禁止**在 postMessage 中直接发送未序列化对象（统一 `JSON.stringify` / safe-parse）
- **禁止**手写 `data/projects/...` 路径（统一使用 `resolveProjectDataPath(projectId)`）
- **禁止**为本 Story 引入 `lucide-react` 或其他新图标库
- **禁止**使用 `../../` 以上的相对导入路径（使用 `@main/`、`@renderer/`、`@shared/`、`@modules/` 别名）
- **禁止**修改 PlateEditor 的 `onSyncFlushReady` / `onReplaceSectionReady` 合同
- **禁止**将 draw.io XML 直接写入 Markdown 文件（XML 存 Plate AST + assets 文件，Markdown 只引用 PNG）
- **禁止**throw 裸字符串（使用 `BidWiseError`）
- **禁止**手动 snake_case ↔ camelCase 转换（Kysely CamelCasePlugin 处理）
- **禁止**在编辑态实现图表自动编号（属于 Story 8-4 导出流程）
- **禁止**暴露整个 `ipcRenderer` 给 contextBridge
- **禁止**在 draw.io iframe 中允许访问 `node-integration`

### Alpha 阶段边界说明

- draw.io 使用远程 embed mode（需网络连接），离线模式为 RC 阶段特性
- 本 Story 不交付完整格式化工具栏，只交付左侧 draw.io 插入入口 + 右侧既有文风选择器
- Alpha 阶段固定 iframe 高度 500px，不实现拖拽改高
- 图表自动编号和交叉引用为 Story 8-4 导出流程特性
- 图表自动生成（AI 生成架构图）不在本 Story 范围
- Mermaid 图表为 Story 3.8 独立实现

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 3.7] — draw.io 架构图内嵌编辑原始需求
- [Source: _bmad-output/planning-artifacts/prd.md#FR25] — 编辑器内嵌入和编辑 draw.io 架构图
- [Source: _bmad-output/planning-artifacts/prd.md#FR55] — 导出时 draw.io 自动转高清 PNG
- [Source: _bmad-output/planning-artifacts/architecture.md#Plate编辑器扩展] — 自定义 Void Element 包裹 draw.io iframe
- [Source: _bmad-output/planning-artifacts/architecture.md#D5] — Markdown 纯净 + sidecar JSON 元数据
- [Source: _bmad-output/planning-artifacts/architecture.md#draw.io集成] — iframe + postMessage 模式
- [Source: _bmad-output/planning-artifacts/architecture.md#项目文件结构] — assets 目录存储 .drawio 和 .png
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#图形层] — mxgraph (draw.io) 独立集成
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#图表编号] — 编辑态占位符，导出时自动编号
- [Source: _bmad-output/implementation-artifacts/3-6-writing-style-template.md] — EditorToolbar 容器、Plate 插件追加模式
- [Source: _bmad-output/implementation-artifacts/3-7-drawio-embedded-editing-ux/prototype.manifest.yaml] — 本 Story UX manifest 与 lookup order
- [Source: _bmad-output/implementation-artifacts/3-7-drawio-embedded-editing-ux/ux-spec.md] — 本 Story 交互与视觉约束
- [Source: _bmad-output/implementation-artifacts/3-7-drawio-embedded-editing-ux/exports/gSbw7.png] — 默认态 toolbar 视觉参考
- [Source: _bmad-output/implementation-artifacts/3-7-drawio-embedded-editing-ux/exports/RmZHn.png] — iframe 编辑态视觉参考
- [Source: _bmad-output/implementation-artifacts/3-7-drawio-embedded-editing-ux/exports/a7QGi.png] — PNG 预览态视觉参考
- [Source: _bmad-output/implementation-artifacts/3-7-drawio-embedded-editing-ux/exports/kDWv6.png] — 重编辑态视觉参考
- [Source: _bmad-output/implementation-artifacts/3-7-drawio-embedded-editing-ux/prototype.pen] — frame 结构与操作栏细节
- [Source: https://www.drawio.com/doc/faq/supported-url-parameters] — `embed.diagrams.net` embed mode URL 与 `embed=1` 参数
- [Source: https://www.drawio.com/doc/faq/embed-mode] — JSON-string postMessage 协议（`init` / `save` / `exit`）

## Change Log

- 2026-04-07: `validate-create-story` 修订
  - 修正了 toolbar 与 Plate 上下文脱钩、同步反序列化链路、CSP 配置位置、资产命名、图标依赖、以及重编辑触发条件等实现阻塞项
  - 补齐了删除动作、测试 mock iframe 策略、`resolveProjectDataPath` 路径约束、以及 story 级 UX 工件引用
  - 明确了 draw.io 原生 Save / Exit 控件复用、`ApiResponse` envelope 解包要求、保存失败保持编辑态、以及资产缺失时的非崩溃 fallback

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
