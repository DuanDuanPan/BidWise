---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
status: 'complete'
completedAt: '2026-03-17'
inputDocuments: ['_bmad-output/planning-artifacts/prd.md', 'docs/pre_sales_proposal_system_design.md']
workflowType: 'architecture'
project_name: BidWise
user_name: Enjoyjavapan
date: '2026-03-17'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## 项目上下文分析

### 需求概览

**功能需求：** 69 条 FR，9 个能力域

| 能力域 | FR 范围 | 架构复杂度 |
|--------|---------|-----------|
| 投标项目管理 | FR1-FR8 | 低 |
| 招标文件分析 | FR9-FR18 | 高（OCR + LLM 解析 + 追溯矩阵） |
| 方案生成与编辑 | FR19-FR30 | 高（AI 生成 + 富文本编辑器 + draw.io + 批注） |
| 资产与知识管理 | FR31-FR38 | 中（语义检索 + 批量导入引擎） |
| 成本评估与模拟 | FR39-FR43 | 中（GAP 分析 + What-if 模拟器） |
| 质量保障与合规 | FR44-FR52 | 高（动态对抗 Agent + 多层合规校验 + 评分引擎） |
| 交付与导出 | FR53-FR58 | 高（python-docx 精确渲染 + 格式降级） |
| 系统管理与部署 | FR59-FR65 | 中（Git 同步 + 静默更新 + 自动回滚） |

**非功能需求：** 29 条 NFR，5 类

| 类别 | 关键约束 |
|------|---------|
| 性能 | 启动 <5s、章节生成 <2min、编辑器响应 <100ms、docx 导出 <30s |
| 安全 | 数据 100% 本地、AI 调用脱敏、IPC 隔离、Git 仅内网 |
| 可靠性 | AI 成功率 >99%、docx 完整性 100%、崩溃零丢失、更新自动回滚 |
| 集成 | Claude/OpenAI 双 API、OCR 中文 >95%、Git 自动合并 >95% |
| 可维护性 | docx 引擎独立升级、跨平台一致性、大数据量稳定性 |

### 架构关键驱动因素

**驱动因素 1：三进程桌面架构**
Electron 主进程（Node.js）+ 渲染进程（React）+ Python docx 渲染独立进程。三进程的通信协议、数据传递边界和安全隔离是核心架构骨架。

**驱动因素 2：AI Agent 编排系统**
至少 6 类 Agent（解析、种子、生成、对抗、评分、GAP），共享上下文但独立调用 LLM。需要统一的 Agent 编排层管理调度、上下文传递、超时重试和降级策略。所有 AI 调用经脱敏代理层。

**驱动因素 3：长链路数据管道**
招标文件 → OCR → 结构化需求 → 评分模型 → 策略种子 → 方案骨架 → 章节生成 → 批注 → 对抗 → 合规校验 → docx 导出。每个节点有中间状态需持久化，支持断点恢复和章节级重新执行。

**驱动因素 4：双层数据架构**
- 公司级数据（资产库/术语库/模板/基线）：Git 同步，多用户共享，冲突解决
- 项目级数据（方案/批注/对抗/GAP/成本）：本地隔离，单项目内完整

**驱动因素 5：安全硬约束**
本地优先不可妥协。方案全文永不出本地，AI 调用经脱敏代理层自动替换/还原。安全渗透到每个组件——不是附加层，而是架构基因。

### 规模与复杂度

- **项目复杂度：** 高（按子系统分级）
- **主要技术领域：** Electron 桌面应用 + AI Agent 系统 + 文档处理引擎
- **预估架构组件：** 12-15 个主要模块
- **目标平台：** Windows 10/11 + macOS 12+
- **项目状态：** Greenfield

### 技术约束与依赖

| 约束 | 来源 | 架构影响 |
|------|------|---------|
| Electron + React | PRD 桌面应用需求 | 前端组件体系、IPC 通信模式 |
| python-docx 独立进程 | PRD 实现考量 | localhost HTTP 通信、独立部署和升级 |
| Plate/Slate 富文本编辑器 | PRD 实现考量 | 编辑器插件架构、批注和 draw.io 集成 |
| draw.io 集成 | PRD 实现考量 | iframe + postMessage 模式，draw.io 编辑状态与 Slate 文档树通过自定义协议同步 |
| SQLite + 文件系统 | PRD 平台支持 | 本地持久化层设计、查询性能优化 |
| Git-based 同步 | PRD 系统集成 | 公司级数据版本管理和冲突解决 |
| Claude/OpenAI API | PRD 集成 NFR | AI 代理层抽象、多 Provider 适配 |
| 本地优先 + 脱敏 | PRD 安全 NFR | 全局安全架构、数据流审计 |
| MVP Alpha/Beta/RC 分期 | PRD 范围 | 架构支持增量交付，Alpha 跑通核心链路 |
| BidWise Markdown 扩展规范 | 格式链需求 | 需定义覆盖批注/图表占位符/资产引用等 Markdown 原生不支持语义的扩展语法，确保 Slate ↔ Markdown ↔ python-docx 三方对齐 |

### 跨切面关注点

| 关注点 | 影响范围 | 架构含义 |
|--------|---------|---------|
| **AI 脱敏代理层** | 所有 AI Agent 调用 | 统一拦截层，可配置脱敏规则，自动替换/还原 |
| **Annotation Service（批注服务）** | 生成、对抗、协作、成本审批、编辑器 | **独立架构组件**（非编辑器子模块）。承载 6 种来源语义（AI 建议/资产推荐/评分预警/对抗反馈/人工批注/跨角色指导），并通过状态字段表达待决策；支持双向流动（AI↔人、人↔人）。编辑器、对抗引擎、评分引擎、成本模块均通过 Annotation Service 发布和订阅批注 |
| **评分模型** | 解析→生成→对抗→成本模拟 | 全系统共享的核心数据结构，贯穿所有 SOP 阶段 |
| **异步任务管理** | OCR、AI 生成、对抗、批量导入 | 统一任务队列 + 进度反馈 + 取消/重试 + **断点恢复**（任务状态持久化，崩溃后从断点继续） |
| **容错与降级** | 章节重生成、格式降级、创新链解耦 | 系统性错误处理框架，每个节点独立可降级 |
| **Markdown ↔ AST ↔ docx 格式链** | 编辑→存储→渲染→导出 | 三层格式一致性转换；需定义 BidWise Markdown 扩展规范覆盖批注/占位符/资产引用，确保 Slate AST ↔ Markdown ↔ python-docx 三方无损转换 |
| **AI 调用链可追溯** | 所有 AI Agent 调用 | 每次 AI 调用记录：输入 prompt（脱敏后）、输出结果、耗时、token 消耗、调用者 Agent 身份。用户不可见，开发/调试用。Alpha 阶段验证核心假设的关键基础设施 |
| **经验知识图谱（Experience Graph）** | AI 生成、批注处理、对抗评审、评分校准 | 人机协作中的决策经验自动沉淀为时序知识图谱。6 类经验：术语修正/内容驳回/交叉火力决策/评分校准/方案模式/格式教训。AI 生成前自动查询相关经验注入 prompt 上下文，防止重复犯错。Graphiti（graphiti-core）+ Kuzu 嵌入式图数据库，运行在 Python 进程中。Alpha 积累 AI 调用日志数据基础，Beta 引入图谱引擎+经验捕获+基础注入，RC 全维度飞轮 |

## Starter 模板评估

### 主要技术领域

Electron 桌面应用（React + TypeScript + Tailwind CSS），AI Agent 系统 + 文档处理引擎。使用 LLM 辅助开发。

### 评估的 Starter 选项

| 选项 | 构建工具 | 优势 | 劣势 |
|------|---------|------|------|
| **electron-vite** | Vite | 最快 HMR、清晰 main/preload/renderer 分离、轻量、活跃维护 | 社区生态不如 Forge 丰富 |
| **Electron Forge (Vite 模板)** | Vite | 官方工具链、一站式打包分发 | 抽象层较重，复杂项目控制权不足 |
| **electron-react-boilerplate** | Webpack | 社区成熟 | Webpack 构建慢、结构较老 |

### 选定 Starter：electron-vite

**选择理由：**
- Vite 原生 ESM 开发服务器，HMR 最快，LLM 辅助开发迭代速度关键
- 原生 main/preload/renderer 三层分离，与 BidWise 三进程架构天然对齐
- 轻量抽象，对复杂构建需求（Python 进程、draw.io、Plate）有精细控制权
- 配合 electron-builder 打包分发

**初始化命令：**

```bash
pnpm create @quick-start/electron bidwise -- --template react-ts
```

**关键配置（初始化后立即执行）：**

`.npmrc`：
```
shamefully-hoist=true
```
解决 pnpm + electron-builder 依赖查找兼容问题，必须在项目初始化时配好。

### 补充技术选型

**状态管理：Zustand**
- Store-based 模式适合 BidWise 的"应用级互联状态"（多项目、SOP 阶段、批注、评分、GAP）
- 按领域划分多个 store，Alpha 阶段定义核心 stores（projectStore / documentStore / analysisStore），Beta 扩展（annotationStore / reviewStore / costStore）
- ~1KB、零 boilerplate、无需 Provider

**测试框架：Vitest + Playwright + pytest**
- **Vitest**：主进程+渲染进程的单元/集成测试（Vite 原生、Jest 兼容）
- **Playwright**：E2E 测试（原生支持 Electron 测试）
- **pytest**：Python docx 渲染引擎的独立测试体系

### 代码组织结构

```
bidwise/
├── .npmrc                    ← shamefully-hoist=true
├── electron.vite.config.ts
├── package.json
│
├── src/
│   ├── main/                 ← Electron 主进程（Node.js）
│   │   ├── index.ts          ← 入口
│   │   ├── ipc/              ← IPC handler 注册（薄分发层）
│   │   ├── services/         ← 业务服务层
│   │   │   ├── ai-proxy/         ← AI 脱敏代理（拦截/替换/还原）
│   │   │   ├── agent-orchestrator/ ← Agent 编排（Alpha 第一天即存在，接口支持即插即用）
│   │   │   ├── document-parser/   ← 招标文件解析（OCR + LLM 结构化）
│   │   │   ├── docx-bridge/       ← Python 渲染进程通信（localhost HTTP）
│   │   │   ├── git-sync/          ← Git 同步服务
│   │   │   └── task-queue/        ← 异步任务管理（进度/重试/断点恢复）
│   │   ├── db/               ← SQLite 数据访问层
│   │   └── utils/
│   │
│   ├── preload/              ← 预加载脚本（contextBridge 安全隔离）
│   │   └── index.ts
│   │
│   └── renderer/             ← React 渲染进程
│       ├── src/
│       │   ├── App.tsx
│       │   ├── stores/           ← Zustand stores（跨模块状态）
│       │   │   ├── projectStore.ts    ← Alpha: 项目列表+当前项目
│       │   │   ├── documentStore.ts   ← Alpha: 方案内容+编辑状态
│       │   │   ├── analysisStore.ts   ← Alpha: 解析结果+评分模型
│       │   │   ├── annotationStore.ts ← Beta: 批注服务状态
│       │   │   ├── reviewStore.ts     ← Beta: 对抗评审状态
│       │   │   └── costStore.ts       ← Beta: 成本估算状态
│       │   ├── modules/          ← 领域模块（按 SOP 阶段对齐）
│       │   │   ├── project/      ← Alpha: 项目管理+看板+SOP导航
│       │   │   ├── analysis/     ← Alpha: 招标解析+评分+种子+迷雾地图
│       │   │   ├── editor/       ← Alpha: 方案编辑器+Plate+draw.io+批注
│       │   │   ├── export/       ← Alpha: 导出预览+docx导出
│       │   │   ├── cost/         ← Beta: GAP+4号文+What-if模拟
│       │   │   ├── review/       ← Beta: 对抗评审+合规+评分仪表盘
│       │   │   ├── asset/        ← Beta: 资产库+术语库
│       │   │   └── admin/        ← RC: 系统管理+冷启动向导
│       │   ├── shared/           ← 共享组件+hooks+utils
│       │   └── lib/              ← 工具库
│       └── index.html
│
├── python/                   ← Python 独立进程（docx 渲染 + 经验图谱引擎）
│   ├── pyproject.toml        ← Python 项目配置
│   ├── src/
│   │   ├── docx_renderer/    ← docx 渲染引擎源码
│   │   └── graphiti_engine/  ← 经验知识图谱引擎（Graphiti + Kuzu）
│   │       ├── __init__.py
│   │       ├── app.py        ← FastAPI 路由（与 docx_renderer 共享或独立端口）
│   │       ├── graph/        ← 图谱 CRUD（实体/关系/episode 管理）
│   │       ├── capture/      ← 经验捕获（从 diff/批注/决策中提取经验）
│   │       ├── retrieval/    ← 经验检索（混合语义+BM25+图遍历）
│   │       └── models/       ← 经验数据模型
│   └── tests/                ← pytest 测试
│
├── tests/
│   ├── unit/                 ← Vitest 单元测试
│   ├── integration/          ← Vitest 集成测试（IPC 通信等）
│   └── e2e/                  ← Playwright E2E 测试
│
└── resources/                ← 应用资源（图标/模板等）
```

### Alpha/Beta/RC 模块激活对齐

**MVP 范围边界声明：** 当前实施范围为 MVP（Alpha→Beta→RC），目标角色为售前工程师的完整体验。商务经理和 IT 管理员在 MVP 范围内仅作为"共享视图/基础管理能力"存在，**不构建独立角色工作台**（独立工作台延迟到 V1.0+，与 UX 规范 §执行摘要 对齐）。RC 阶段的 admin 模块是基础管理能力（配置/部署/更新），不是独立的管理员面板。

| 阶段 | 激活的 renderer 模块 | 激活的 main services | 激活的 stores | 角色范围 |
|------|---------------------|---------------------|--------------|---------|
| Alpha | project, analysis, editor, export | ai-proxy, agent-orchestrator, document-parser, docx-bridge, task-queue | projectStore, documentStore, analysisStore | 售前工程师 |
| Beta | + cost, review, asset | + git-sync, **+ graphiti-engine（经验图谱）** | + annotationStore, reviewStore, costStore | 售前工程师 + 共享成本视图 |
| RC | + admin（基础管理能力） | 全部完善 | 全部完善 | 售前工程师 + 管理员基础能力 |
| V1.0+ | 独立角色工作台（商务经理/IT 管理员/售前总监） | 角色权限体系 | 角色专属 stores | 多角色独立体验 |

**经验图谱分期策略：**
- **Alpha**：AI 调用日志 + 用户修改 diff 记录到 `data/logs/`，积累数据基础（不引入图谱）
- **Beta**：引入 Graphiti + Kuzu，从 Alpha 积累的历史数据回溯构建初始图谱；经验自动捕获开始运转；AI 生成时注入"术语修正"和"内容驳回"两类经验
- **RC**：经验注入扩展到交叉火力决策历史、评分校准、中标/丢标模式；跨项目飞轮成型

### Agent 编排层设计原则

agent-orchestrator 从 Alpha 第一天存在，核心接口：
- `registerAgent(type, handler)` — 注册新 Agent 类型
- `executeAgent(type, context)` — 执行指定 Agent
- `getAgentStatus(taskId)` — 查询任务状态
- Alpha 注册：ParseAgent、GenerateAgent
- Beta 注册：SeedAgent、AdversarialAgent、ScoringAgent、GapAgent

**注意：** 项目初始化应作为 Alpha 阶段的第一个实施 Story。

## 核心架构决策

### 决策优先级分析

**关键决策（阻塞实施）：**

| # | 决策 | 选择 | 理由 |
|---|------|------|------|
| D1 | 数据库访问层 | better-sqlite3 + Kysely + Kysely Migrator | 同步 API 性能优、Electron 兼容成熟、TypeScript 类型安全、启动时自动迁移 |
| D2a | Electron IPC | 原生 ipcMain/ipcRenderer + 手动类型定义 | 简单直接，LLM 辅助开发可生成和维护类型 |
| D2b | Python 进程通信 | FastAPI over localhost HTTP | 调试友好（可 curl 测试）、自带 OpenAPI 文档、语言无关 |
| D3a | AI 脱敏策略 | NER 模型（本地运行），正则作为基线保底 | 智能识别上下文敏感实体，正则保底确保可预测性 |
| D3b | API Key 存储 | 加密配置文件（本地 AES 加密） | 跨平台一致，部署简单 |
| D4 | Annotation Service | Zustand annotationStore + 订阅模式 | 与现有状态管理统一，React 响应式渲染，主进程 IPC 持久化到 SQLite |
| D5 | Markdown 扩展规范 | Markdown 纯净 + sidecar JSON 元数据 | Markdown 100% 标准可读（数据主权），元数据通过 section ID/锚点引用；图表/资产用标准 Markdown 图片语法内联 |
| D6 | 经验知识图谱 | Graphiti（graphiti-core）+ Kuzu 嵌入式图数据库 | 时序知识图谱存储人机协作经验（术语修正/内容驳回/交叉火力决策/评分校准），Kuzu 嵌入式无需独立进程（类 SQLite 体验），Graphiti 自动从非结构化交互提取实体/关系，检索阶段无需 LLM（混合语义+BM25+图遍历，P95 <300ms），构建阶段通过脱敏代理层调用 LLM |

**由 Starter 和 PRD 已确定的决策：**

| 决策 | 选择 | 来源 |
|------|------|------|
| 客户端框架 | Electron + React + TypeScript | PRD |
| 构建工具 | electron-vite + Vite | Step 3 |
| 富文本编辑器 | Plate / Slate | PRD |
| 样式方案 | Tailwind CSS | 用户偏好 |
| 状态管理 | Zustand（多 store 按领域划分） | Step 3 |
| 包管理器 | pnpm（shamefully-hoist=true） | 用户偏好 + Step 3 |
| docx 渲染 | python-docx 独立进程 | PRD |
| 本地存储 | SQLite + 文件系统 | PRD |
| 测试框架 | Vitest + Playwright + pytest | Step 3 |
| AI API | Claude/OpenAI 双 Provider | PRD |
| 公司数据同步 | 内部 Git 仓库 | PRD |
| draw.io 集成 | iframe + postMessage | Step 2 Party Mode |

**延迟决策（Post-MVP）：**

| 决策 | 延迟理由 |
|------|---------|
| 本地 AI 推理框架选型 | V1.0 才引入 |
| 多方案类型 Profile 架构细节 | MVP 单类型，V1.0 扩展 |
| 资产库向量检索引擎选型 | D6 Graphiti 已包含语义嵌入检索能力，Beta 阶段验证 |

### 数据架构

**本地存储分层：**

| 层 | 技术 | 内容 | 同步方式 |
|---|------|------|---------|
| 项目数据 | SQLite（Kysely 访问） | 项目元数据、SOP 状态、解析结果、评分模型、GAP 分析、对抗结果、成本估算 | 本地隔离，不同步 |
| 方案内容 | 文件系统（Markdown + sidecar JSON） | 方案正文（.md）、元数据（.meta.json）、资产文件（.drawio/.png/.csv） | 本地隔离 |
| 公司数据 | 文件系统 + SQLite | 资产库、术语库、模板库、能力基线 | Git 内部仓库同步 |
| 系统配置 | 加密配置文件 | API Key、脱敏规则、同步设置 | 管理员手动配置 |
| 经验知识图谱 | Kuzu 嵌入式图数据库 + Graphiti（graphiti-core） | 人机协作经验（术语修正/内容驳回/决策记录/评分校准）、资产语义关系、客户画像、跨项目知识沉淀 | 公司级经验通过 Git 同步；项目级经验本地隔离 |

**Kysely 迁移策略：** 应用启动时自动执行 `migrator.migrateToLatest()`，迁移文件按时间戳命名，支持版本升级时的数据结构演进。

**项目文件结构：**
```
projects/{project-id}/
├── proposal.md              ← 方案正文（纯标准 Markdown）
├── proposal.meta.json       ← sidecar 元数据（批注/评分/对抗/合规/GAP，通过 section ID 引用）
├── assets/
│   ├── arch-diagram.drawio  ← 可编辑架构图源文件
│   ├── arch-diagram.png     ← 导出用图片
│   └── func-table.csv       ← 表格数据
├── scoring-model.json       ← 评分模型
├── seed.json                ← 策略种子
├── gap-analysis.json        ← GAP 分析结果
└── template-mapping.json    ← 模板样式映射配置
```

### 安全架构

**AI 脱敏代理层：**
- 双层策略：正则规则（确定性基线）+ NER 模型（智能增强）
- 正则：精确匹配公司名、客户名、金额、合同号等可枚举模式
- NER：识别上下文中的人名、地名、组织名、技术参数等模糊敏感实体
- 脱敏前后映射表本地持久化，AI 返回结果自动还原
- 管理员可配置脱敏规则和白名单

**API Key 存储：**
- 本地 AES-256 加密配置文件
- 加密密钥派生自机器标识（跨机器不可解密）
- Git 同步时 API Key 配置文件在 .gitignore 中排除

**Electron 安全：**
- contextBridge 严格隔离，渲染进程无法直接访问 Node.js API
- IPC handler 白名单机制，只暴露必要接口

### 通信架构

**Electron IPC（主进程 ↔ 渲染进程）：**
- 原生 ipcMain/ipcRenderer + 手动 TypeScript 类型定义
- IPC handler 按 service 域名组织（如 `project:create`、`analysis:parse`、`agent:execute`）
- 类型定义集中管理在 `src/shared/ipc-types.ts`

**Python 进程通信（主进程 ↔ docx 渲染引擎）：**
- FastAPI over localhost HTTP（随机端口，启动时协商）
- 主进程作为 Python 进程的生命周期管理者（启动/重启/健康检查）
- OpenAPI 自动文档，便于调试和 LLM 辅助开发

**Annotation Service 通信：**
- Zustand annotationStore 管理渲染侧批注状态（响应式 UI 更新）
- 批注变更通过 IPC 同步到主进程持久化（SQLite + sidecar JSON）
- 跨角色通知通过 store subscription + 系统通知

### 前端架构

**组件架构：**
- 领域模块化（modules/）：每个模块自包含 components、hooks、types
- 共享层（shared/）：通用 UI 组件、hooks、utils
- Zustand stores 跨模块通信，模块间不直接 import

**Plate 编辑器扩展：**
- 自定义 Void Element 包裹 draw.io iframe
- 批注通过 Plate mark 机制实现内联标记，着色由 annotationStore 驱动
- 编辑器变更 → Slate AST → Markdown 序列化 → 文件系统持久化

### 决策影响分析

**实施顺序：**
1. 项目初始化（electron-vite + pnpm + .npmrc）
2. SQLite + Kysely 数据层 + 迁移基础
3. IPC 骨架 + 类型定义
4. AI 代理层（脱敏 + 多 Provider 适配）
5. Agent 编排层基础接口
6. Plate 编辑器基础 + Markdown 序列化
7. python-docx 渲染进程 + FastAPI 通信
8. annotationStore + 批注 UI

**跨组件依赖：**
- Agent 编排层依赖 AI 代理层（脱敏）→ 必须先有代理层
- 批注系统依赖 Plate 编辑器 + annotationStore → 编辑器和 store 同步开发
- docx 导出依赖 Markdown 序列化规范 + 模板映射 → Markdown 规范先定义
- What-if 模拟依赖评分引擎 + GAP 分析 → Beta 阶段串行实现

## 实现模式与一致性规则

### 命名模式

| 类别 | 规则 | 示例 |
|------|------|------|
| SQLite 表名 | snake_case 复数 | `projects`、`assets`、`scoring_models` |
| SQLite 列名 | snake_case | `project_id`、`created_at`、`scoring_weight` |
| 外键 | `{referenced_table_singular}_id` | `project_id`、`asset_id` |
| DB↔TS 映射 | Kysely `CamelCasePlugin` 自动转换，禁止手动映射 | DB `scoring_weight` → TS `scoringWeight` |
| IPC 频道 | `{domain}:{action}` | `project:create`、`analysis:parse`、`agent:execute` |
| Zustand store | camelCase + Store | `projectStore`、`annotationStore` |
| React 组件 | PascalCase | `ProjectBoard`、`ScoringDashboard` |
| 组件文件 | PascalCase.tsx | `ProjectBoard.tsx` |
| hooks | camelCase，use 前缀 | `useProject`、`useAnnotations` |
| 工具函数 | camelCase | `parseRfpDocument`、`calculateGap` |
| 模块目录 | kebab-case | `project/`、`analysis/`、`editor/` |
| Python 代码 | PEP 8 snake_case | `render_docx`、`parse_template` |
| FastAPI 端点 | kebab-case 复数 | `/api/render-documents`、`/api/health` |
| sidecar JSON 字段 | camelCase | `sectionId`、`annotationType` |
| prompt 文件 | `{name}.prompt.ts` | `parse-rfp.prompt.ts`、`generate-chapter.prompt.ts` |

### 格式模式

**统一 Response Wrapper（IPC + FastAPI 共用）：**

```typescript
// Success
{ success: true, data: T }

// Error
{ success: false, error: { code: string, message: string } }
```

IPC 和 FastAPI 端点**统一使用此格式**，避免 docx-bridge 做格式适配。

**sidecar JSON 元数据结构（proposal.meta.json）：**
```json
{
  "version": "1.0",
  "projectId": "uuid",
  "annotations": [
    {
      "id": "uuid",
      "projectId": "uuid",
      "sectionId": "section-3.2 | project-root",
      "type": "ai-suggestion | asset-recommendation | score-warning | adversarial | human | cross-role",
      "content": "...",
      "author": "agent:generate | system:scoring | user:default",
      "status": "pending | accepted | rejected | needs-decision",
      "createdAt": "2026-03-17T15:30:00.000Z",
      "updatedAt": "2026-03-17T15:30:00.000Z"
    }
  ],
  "scoringModel": { },
  "adversarialResults": [ ],
  "complianceStatus": { }
}
```

**日期时间：** 存储和传输一律 ISO-8601（`2026-03-17T15:30:00.000Z`），UI 层按 locale 格式化。

### 通信模式

**Zustand Store 模式：**
```typescript
interface ProjectStore {
  // State
  projects: Project[]
  currentProject: Project | null
  loading: boolean
  error: string | null
  // Actions
  loadProjects: () => Promise<void>
  createProject: (data: CreateProjectInput) => Promise<Project>
  setCurrentProject: (id: string) => void
}
```
- State 和 Actions 同一 store 定义
- 异步 Action 内部管理 loading/error
- **跨 Store 通信：** 通过 `subscribeWithSelector` 响应式订阅，跨 store 数据聚合在组件层通过自定义 hooks 完成（如 `useAnnotationsForSection`），禁止在 Action 内同步调用其他 store 的 Action

**IPC Handler 模式（主进程）：**
```typescript
// src/main/ipc/project-handlers.ts
export function registerProjectHandlers() {
  ipcMain.handle('project:create', async (_, payload) => {
    try {
      const result = await projectService.create(payload)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: { code: 'PROJECT_CREATE_FAILED', message: error.message } }
    }
  })
}
```
- 每个域一个 handler 文件，handler 只做参数解析和结果包装
- 业务逻辑在 service 层
- 统一 success/error wrapper

**AI Agent 调用模式：**
```typescript
const result = await agentOrchestrator.execute({
  agentType: 'parse',
  context: { rfpContent, scoringCriteria },
  options: { timeout: 120000, retries: 2 }
})
```
- 所有 AI 调用必须经过 orchestrator（禁止绕过）
- orchestrator 统一处理：脱敏 → **查询经验图谱** → 注入经验上下文 → 调用 → 还原 → 日志 → **捕获经验** → 重试/降级

**Prompt 文件规范：**
```typescript
// src/main/prompts/parse-rfp.prompt.ts
export function parseRfpPrompt(context: { rfpContent: string; language: string }): string {
  return `...`
}
```
- 所有 prompt 以 `.prompt.ts` 结尾，导出 `(context: T) => string` 类型化函数
- 集中管理在 `src/main/prompts/` 目录
- 类型检查、可测试、版本可追踪

### 过程模式

**错误处理：**
- 主进程 service 层：抛出 `BidWiseError` 类型化错误（基类 + 错误码）
- IPC handler 层：catch 并包装为统一 `{ success: false, error }` 格式
- 渲染进程：store action 内 catch 并设置 `error` 状态，组件消费 error 展示 UI
- Python 进程：FastAPI HTTPException + 统一 `{ success, data, error }` schema

**异步任务白名单（必须走 task-queue）：**
- AI Agent 调用
- OCR 解析
- 批量导入
- docx 导出
- Git 同步
- 资产库语义检索

任务状态持久化到 SQLite，支持断点恢复。进度通过 IPC 推送到渲染进程。

**Loading 状态：** Store 中统一用 `loading: boolean` 或 `loadingStates: Record<string, boolean>`，禁止 `isLoading`/`fetching`/`pending` 等不一致命名。

### 路径别名规则

```typescript
// tsconfig.json + electron.vite.config.ts
{
  "@main/*":     "src/main/*",
  "@renderer/*": "src/renderer/src/*",
  "@shared/*":   "src/shared/*",
  "@modules/*":  "src/renderer/src/modules/*"
}
```
所有跨目录 import 使用路径别名，**禁止相对路径超过 1 层（禁止 `../../`）**。

### 强制规则

**所有 AI Agent（含 LLM 编码会话）必须遵守：**

1. 所有 AI 调用经过 agent-orchestrator，禁止直接调用 API
2. 所有 IPC 和 FastAPI 通信使用统一 `{ success, data, error }` wrapper
3. 所有数据库操作通过 Kysely（含 CamelCasePlugin），禁止 raw SQL 和手动字段映射
4. 所有日期时间 ISO-8601 格式
5. 组件 PascalCase、函数 camelCase、DB snake_case、JSON camelCase
6. 白名单操作必须走 task-queue（AI 调用/OCR/导入/导出/Git 同步/语义检索）
7. 所有错误使用 BidWiseError 类型体系，禁止 throw 裸字符串
8. 所有 AI prompt 以 `.prompt.ts` 导出类型化函数，集中在 `src/main/prompts/`
9. 所有跨目录 import 使用路径别名，禁止 `../../`
10. Store 跨读通过 `subscribeWithSelector` + 组件层 hooks，禁止 Action 内跨 store 调用
11. 所有 AI Agent 调用前必须查询经验图谱获取相关上下文（Beta 阶段起生效，Alpha 阶段记录日志为图谱构建积累数据）

**反模式（禁止）：**
- 渲染进程直接 import Node.js 模块
- IPC handler 中写业务逻辑
- 硬编码 prompt 在业务代码中
- 手动 snake_case ↔ camelCase 转换
- 相对路径 import 超过 1 层
- 在 Action 内同步调用其他 store 的 Action
- 不走 task-queue 的白名单异步操作

## 项目结构与边界

### 完整项目目录结构

```
bidwise/
├── .npmrc                          ← shamefully-hoist=true
├── .gitignore
├── .eslintrc.cjs
├── .prettierrc
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json                   ← 基础 TS 配置
├── tsconfig.node.json              ← Node.js（主进程）TS 配置（含 @shared/* 别名）
├── tsconfig.web.json               ← Web（渲染进程）TS 配置（含 @shared/* 别名）
├── electron.vite.config.ts         ← electron-vite 构建配置（含路径别名）
├── electron-builder.yml            ← 打包配置（Win+Mac）
├── vitest.config.ts
├── playwright.config.ts
├── tailwind.config.ts
├── postcss.config.js
│
├── src/
│   ├── shared/                     ← 主进程+渲染进程共享类型（@shared/* 在 tsconfig.node + tsconfig.web 中均配置）
│   │   ├── ipc-types.ts            ← IPC 频道+payload 类型定义
│   │   ├── models/                 ← 共享数据模型
│   │   │   ├── project.ts
│   │   │   ├── proposal.ts
│   │   │   ├── annotation.ts
│   │   │   ├── scoring.ts
│   │   │   ├── asset.ts
│   │   │   └── index.ts
│   │   └── constants.ts            ← 共享常量（错误码、枚举等）
│   │
│   ├── main/                       ← Electron 主进程
│   │   ├── index.ts                ← 入口（窗口创建+IPC 注册+迁移执行+Python 进程启动）
│   │   ├── ipc/                    ← IPC Handler（薄分发层）
│   │   │   ├── project-handlers.ts
│   │   │   ├── analysis-handlers.ts
│   │   │   ├── agent-handlers.ts
│   │   │   ├── asset-handlers.ts
│   │   │   ├── export-handlers.ts
│   │   │   ├── admin-handlers.ts
│   │   │   └── index.ts
│   │   ├── services/               ← 业务服务层
│   │   │   ├── ai-proxy/
│   │   │   │   ├── desensitizer.ts
│   │   │   │   ├── provider-adapter.ts
│   │   │   │   └── index.ts
│   │   │   ├── agent-orchestrator/
│   │   │   │   ├── orchestrator.ts
│   │   │   │   ├── agents/
│   │   │   │   │   ├── parse-agent.ts
│   │   │   │   │   ├── generate-agent.ts
│   │   │   │   │   ├── seed-agent.ts
│   │   │   │   │   ├── adversarial-agent.ts
│   │   │   │   │   ├── scoring-agent.ts
│   │   │   │   │   └── gap-agent.ts
│   │   │   │   └── index.ts
│   │   │   ├── document-parser/
│   │   │   │   ├── ocr-service.ts
│   │   │   │   ├── rfp-parser.ts
│   │   │   │   ├── scoring-extractor.ts
│   │   │   │   ├── mandatory-item-detector.ts
│   │   │   │   └── index.ts
│   │   │   ├── docx-bridge/
│   │   │   │   ├── process-manager.ts
│   │   │   │   ├── render-client.ts
│   │   │   │   └── index.ts
│   │   │   ├── git-sync/
│   │   │   │   ├── sync-manager.ts
│   │   │   │   ├── conflict-resolver.ts
│   │   │   │   └── index.ts
│   │   │   ├── task-queue/
│   │   │   │   ├── queue.ts
│   │   │   │   ├── progress-emitter.ts
│   │   │   │   └── index.ts
│   │   │   └── crypto/
│   │   │       ├── key-manager.ts
│   │   │       └── config-encryptor.ts
│   │   ├── db/
│   │   │   ├── client.ts
│   │   │   ├── migrations/
│   │   │   │   └── 001_initial_schema.ts
│   │   │   ├── repositories/
│   │   │   │   ├── project-repo.ts
│   │   │   │   ├── asset-repo.ts
│   │   │   │   ├── scoring-repo.ts
│   │   │   │   └── task-repo.ts
│   │   │   └── index.ts
│   │   ├── prompts/
│   │   │   ├── parse-rfp.prompt.ts
│   │   │   ├── extract-scoring.prompt.ts
│   │   │   ├── detect-mandatory.prompt.ts
│   │   │   ├── generate-chapter.prompt.ts
│   │   │   ├── generate-seed.prompt.ts
│   │   │   ├── adversarial-role.prompt.ts
│   │   │   ├── scoring-estimate.prompt.ts
│   │   │   ├── gap-analysis.prompt.ts
│   │   │   └── index.ts
│   │   ├── utils/
│   │   │   ├── errors.ts
│   │   │   ├── logger.ts
│   │   │   └── file-utils.ts
│   │   └── config/
│   │       └── app-config.ts
│   │
│   ├── preload/
│   │   ├── index.ts
│   │   └── index.d.ts
│   │
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── App.tsx
│           ├── main.tsx
│           ├── globals.css
│           ├── stores/
│           │   ├── projectStore.ts
│           │   ├── documentStore.ts
│           │   ├── analysisStore.ts
│           │   ├── annotationStore.ts
│           │   ├── reviewStore.ts
│           │   ├── costStore.ts
│           │   └── index.ts
│           ├── modules/
│           │   ├── project/
│           │   │   ├── components/
│           │   │   ├── hooks/
│           │   │   └── types.ts
│           │   ├── analysis/
│           │   │   ├── components/
│           │   │   ├── hooks/
│           │   │   └── types.ts
│           │   ├── editor/
│           │   │   ├── components/
│           │   │   ├── plugins/
│           │   │   ├── serializer/
│           │   │   ├── hooks/
│           │   │   └── types.ts
│           │   ├── export/
│           │   │   ├── components/
│           │   │   └── types.ts
│           │   ├── cost/
│           │   │   ├── components/
│           │   │   └── types.ts
│           │   ├── review/
│           │   │   ├── components/
│           │   │   └── types.ts
│           │   ├── asset/
│           │   │   ├── components/
│           │   │   └── types.ts
│           │   └── admin/
│           │       ├── components/
│           │       └── types.ts
│           └── shared/
│               ├── components/
│               ├── hooks/
│               └── lib/
│
├── python/                         ← python-docx 渲染引擎（独立进程）
│   ├── pyproject.toml
│   ├── requirements.txt
│   ├── src/
│   │   └── docx_renderer/
│   │       ├── __init__.py
│   │       ├── app.py
│   │       ├── routes/
│   │       ├── engine/
│   │       └── models/
│   └── tests/
│
├── tests/
│   ├── fixtures/                   ← 共享测试数据（所有测试层共用）
│   │   ├── rfp-samples/
│   │   ├── proposal-samples/
│   │   ├── template-samples/
│   │   └── baseline-samples/
│   ├── unit/
│   │   ├── main/
│   │   └── renderer/
│   ├── integration/
│   │   ├── ipc/
│   │   └── docx-bridge/
│   └── e2e/
│       └── flows/
│
├── resources/
│   ├── icon.png
│   └── templates/
│
├── data/                           ← 本地运行时数据（.gitignore，不同步）
│   ├── db/
│   │   └── bidwise.sqlite
│   ├── projects/
│   │   └── {project-id}/
│   │       ├── proposal.md
│   │       ├── proposal.meta.json
│   │       ├── assets/
│   │       ├── scoring-model.json
│   │       ├── seed.json
│   │       ├── gap-analysis.json
│   │       └── template-mapping.json
│   ├── config/
│   │   └── bidwise.config.enc
│   ├── logs/
│   │   └── ai-trace/
│   └── backups/
│
└── company-data/                   ← 公司级共享数据（独立 Git 仓库）
    ├── assets/                     ← 资产库
    ├── terminology/                ← 术语库
    ├── templates/                  ← Word 模板
    └── baselines/                  ← 产品能力基线
```

### 架构边界

**进程边界：**

| 边界 | 通信协议 | 数据流向 |
|------|---------|---------|
| 渲染进程 → 主进程 | IPC (ipcRenderer.invoke) | 用户操作 → 业务处理 |
| 主进程 → 渲染进程 | IPC (webContents.send) | 任务进度/通知 → UI 更新 |
| 主进程 → Python 进程 | HTTP (localhost) | 渲染请求 → docx 文件 |
| 主进程 → 云端 AI | HTTPS（经脱敏代理） | 脱敏 prompt → AI 响应 |
| 主进程 → Git | 本地 Git 命令 | company-data/ 仓库同步 |

**Python 进程启动协议：**
1. 主进程启动 Python 子进程，传入端口号作为命令行参数：`python -m docx_renderer --port {port}`
2. Python FastAPI 绑定端口后向 stdout 输出 `READY:{port}`
3. 主进程读取 stdout 确认就绪后开始发送请求
4. 健康检查：主进程每 30 秒 GET `/api/health`，3 次连续失败自动重启 Python 进程

**数据边界：**

| 数据类型 | 存储位置 | 访问方式 | 同步方式 |
|---------|---------|---------|---------|
| 项目元数据 | `data/db/bidwise.sqlite` | Kysely repo | 本地隔离 |
| 方案内容 | `data/projects/{id}/` | fs 读写 | 本地隔离 |
| 公司资产 | `company-data/`（独立 Git 仓库） | fs + SQLite 索引 | Git 同步 |
| 系统配置 | `data/config/bidwise.config.enc` | 解密后内存读取 | 管理员配置 |
| AI 日志 | `data/logs/ai-trace/` | 追加写入 | 本地不同步 |

### FR → 目录映射

| FR 类别 | 主进程 | 渲染进程 | 数据 |
|---------|--------|---------|------|
| FR1-8 项目管理 | `ipc/project-handlers` + `db/repositories/project-repo` | `modules/project/` + `stores/projectStore` | `data/db/` + `data/projects/` |
| FR9-18 招标分析 | `services/document-parser/` + `agents/parse-agent` | `modules/analysis/` + `stores/analysisStore` | `data/projects/{id}/scoring-model.json, seed.json` |
| FR19-30 方案编辑 | `agents/generate-agent` + `prompts/` | `modules/editor/` + `stores/documentStore, annotationStore` | `data/projects/{id}/proposal.md, proposal.meta.json` |
| FR31-38 资产知识 | `db/repositories/asset-repo` + `services/git-sync/` | `modules/asset/` + `modules/admin/` | `company-data/` |
| FR39-43 成本评估 | `agents/gap-agent` | `modules/cost/` + `stores/costStore` | `data/projects/{id}/gap-analysis.json` |
| FR44-52 质量合规 | `agents/adversarial-agent, scoring-agent` + `document-parser/mandatory-item-detector` | `modules/review/` + `stores/reviewStore` | `data/projects/{id}/proposal.meta.json` |
| FR53-58 交付导出 | `services/docx-bridge/` | `modules/export/` | `python/src/docx_renderer/` |
| FR59-65 系统管理 | `services/git-sync/` + `services/crypto/` + `config/` | `modules/admin/` | `data/config/` + `company-data/` |

### 跨切面 → 目录映射

| 关注点 | 位置 |
|--------|------|
| AI 脱敏代理 | `src/main/services/ai-proxy/` |
| Agent 编排 | `src/main/services/agent-orchestrator/` |
| Annotation Service | `stores/annotationStore` + `db/repositories/` |
| 异步任务队列 | `src/main/services/task-queue/` |
| AI 调用链日志 | `src/main/utils/logger.ts` → `data/logs/ai-trace/` |
| 错误处理 | `src/main/utils/errors.ts` |
| Markdown 序列化 | `modules/editor/serializer/` |
| IPC 类型 | `src/shared/ipc-types.ts` |
| Prompt 管理 | `src/main/prompts/*.prompt.ts` |
| 共享测试数据 | `tests/fixtures/`（所有测试层共用，Python 测试通过路径配置引用） |

## 架构验证结果

### 一致性验证 ✅

所有技术选型兼容，模式与决策对齐，项目结构支撑所有架构决策。无矛盾性发现。

### 需求覆盖验证 ✅

69 条 FR（9 个能力域）和 29 条 NFR（5 类）全量覆盖，每条需求都有明确的架构支撑点和目录映射。

### 实施就绪性验证 ✅

决策完整、模式全面、规则明确、结构到文件级。LLM 辅助开发有 10 条强制规则 + 7 条反模式作为护栏。

### 缺口分析

| 缺口 | 优先级 | 建议 |
|------|--------|------|
| sidecar JSON schema 版本演进 | 中 | 启动时 JSON schema 升级函数，类比 Kysely Migrator |
| 备份范围与恢复流程 | 低 | 备份 = SQLite + projects/ 快照，恢复 = 管理员面板选择备份点 |
| NER 模型选型 | 延迟 | 实施阶段评估 |

### 架构完整性清单

- [x] 项目上下文分析（69 FR / 9 能力域 + 29 NFR + 领域约束）
- [x] Starter 模板选型（electron-vite + React + TypeScript）
- [x] 核心架构决策（7 项关键决策 + 12 项已确定决策 + 3 项延迟决策）
- [x] 实现模式与一致性规则（10 条强制规则 + 7 条反模式）
- [x] 项目结构（完整目录树 + FR 映射 + 跨切面映射）
- [x] 架构验证（一致性 + 覆盖率 + 就绪性 + 缺口）

### 架构就绪评估

**总体状态：** READY FOR IMPLEMENTATION

**置信度：** 高

**关键优势：**
- 三进程架构边界清晰（Electron 主进程 / React 渲染 / Python docx）
- AI Agent 编排层从 Alpha 第一天就存在，支持即插即用
- 创新链解耦设计确保每个节点独立可降级
- LLM 辅助开发有完善的护栏规则（prompt 规范、路径别名、task-queue 白名单等）
- Alpha/Beta/RC 分期与模块激活完美对齐

**未来增强方向：**
- V1.0：本地 AI 推理集成、Stems 去中心化生成架构、多方案类型 Profile
- 性能优化：SQLite 索引策略、大文档流式处理
- 可观测性增强：AI 调用链追溯的可视化工具

### 实施移交指南

**AI Agent 实施准则：**
1. 严格遵循本文档所有架构决策
2. 使用实现模式章节的 10 条强制规则
3. 尊重项目结构和边界定义
4. 所有架构问题以本文档为唯一权威参考

**首要实施优先级：**
```bash
pnpm create @quick-start/electron bidwise -- --template react-ts
```
配置 `.npmrc`（shamefully-hoist=true）→ 路径别名 → SQLite + Kysely → IPC 骨架 → AI 代理层基础
