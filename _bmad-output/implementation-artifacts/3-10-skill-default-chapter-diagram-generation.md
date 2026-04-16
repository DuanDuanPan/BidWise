# Story 3.10: Skill 默认章节图表生成切换与完整性修复

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a 售前工程师,
I want AI 章节生成默认产出经过 skill 校验和修复的 SVG 图表,
so that 自动生成的方案图表具备更稳定的布局、连线和导出质量，并直接复用现有编辑器的 AI 图表资产链路。

## Acceptance Criteria

### AC1: 章节生成默认输出 Skill 图表占位符

```gherkin
Given AI 章节生成命中了适合插图的章节
When `generateChapterPrompt()` 输出图表占位符规范
Then 默认占位符格式改为 `%%DIAGRAM:skill:图表标题:图表描述的UTF-8 Base64编码%%`
     并明确要求模型描述图表意图、组件、分组、关系和关键连线约束

Given 章节文本中出现 AI 直接输出的 ```mermaid 围栏图或 ASCII 结构图
When `generate-agent` 执行围栏守卫转换
Then 统一转换为 `%%DIAGRAM:skill:...%%` 占位符，进入同一条 skill 图表生成链路

Given 现有项目中仍包含 `%%DIAGRAM:mermaid:...%%` 或 `%%DIAGRAM:drawio:...%%`
When 系统解析占位符
Then 继续兼容旧格式，已有文档和回归测试保持可通过
```

### AC2: DiagramType 与语义路由支持 skill-first

```gherkin
Given 图表占位符被解析
When `diagram-validation-service` 和 `diagram-intent-service` 处理图表类型
Then `DiagramType` 支持 `skill`，并将 AI 自动生成图表的默认 `preferredType` 路由到 `skill`

Given 图表语义为 overall-architecture / technical-architecture / business-architecture / integration-architecture
When 解析 skill 图表意图
Then 映射为 `AiDiagramTypeToken = 'architecture'`

Given 图表语义为 deployment-topology / data-architecture / process-flow / sequence-interaction / class-model / module-dependency / state-machine
When 解析 skill 图表意图
Then 分别映射到稳定的 skill 类型 token（如 `network`、`data-flow`、`flowchart`、`sequence`、`class`）
     并保留 `routingReasons` 与 `routingConfidence` 供日志和测试使用
```

### AC3: 章节生成主流程接入现有 ai-diagram 资产格式

```gherkin
Given `generate-agent` 正在处理 skill 图表占位符
When 图表生成成功
Then 主进程调用 `fireworks-tech-graph` skill 生成 SVG，
     将 SVG 保存为 `assets/ai-diagram-{shortId}.svg`，
     并用现有 ai-diagram Markdown 格式写回章节内容：
     `<!-- ai-diagram:{diagramId}:{assetFileName}:{encodedCaption}:{encodedPrompt}:{style}:{diagramType} -->`
     `![{caption}](assets/{assetFileName})`

Given 生成后的 Markdown 进入编辑器或导出链路
When `markdownSerializer` / `figure-export-service` 处理内容
Then 现有 Story 3.9 的 ai-diagram 反序列化、预览、SVG→PNG 导出能力可直接复用，无需新标记格式
```

### AC4: Skill 脚本校验与自动修复闭环接入运行时

```gherkin
Given `fireworks-tech-graph` 返回原始 SVG 文本
When 主进程执行质量门
Then 先提取首个完整 `<svg>...</svg>`，
     再运行 `scripts/validate-svg.js`，
     并执行一次导出级校验（优先 `rsvg-convert ... -o /dev/null`，运行环境缺少该依赖时回退到 `sharp(...).png().toBuffer()` 或等效 PNG 栅格化校验）

Given 校验失败且属于可修复问题
When 生成服务收到脚本错误详情
Then 将错误摘要、原始图表语义、style/type token 回喂给同一 skill 进行 2-3 轮 repair，
     只有通过质量门的 SVG 才能进入资产保存和 Markdown 回写阶段

Given 所有 repair 轮次结束后仍然失败
When 本图表降级处理
Then 当前章节插入 `> [图表生成失败] ...` 失败块，
     记录 warning 和失败原因，
     整体章节生成流程继续完成
```

### AC5: Skill 上下文释放现有 references 能力

```gherkin
Given 主进程为 skill 图表准备 prompt
When 选择 style token 和 diagramType token
Then 生成流程显式加载匹配的 `references/style-*.md` 与 `references/icons.md`，
     让 skill 在运行时获得真实样式 token、图标映射和连线约束说明

Given 未命中特定 style token
When 生成默认图表
Then 默认 style 使用 `flat-icon`，
     对部署 / 拓扑 / 网络章节允许切换到 `blueprint` 映射，规则保持可测试和可覆盖
```

### AC6: 进度、任务队列与兼容边界保持稳定

```gherkin
Given 用户触发 AI 章节生成
When 图表阶段执行
Then 继续走现有 task-queue + generate-agent 流程，
     UI 阶段名保持 `generating-diagrams` / `validating-diagrams`，
     message 中补充 `skill`、`repair attempt x/y` 等细节

Given 用户文档中存在手工 Mermaid void element
When 文档继续编辑或导出
Then 手工 Mermaid 编辑能力保持可用，
     AI 自动章节图表走 skill 资产链路，
     两条路径在编辑器和导出阶段都能共存
```

### AC7: 自动化测试覆盖默认切换、兼容和修复路径

```gherkin
Given 本 Story 完成实现
When 运行单元、集成与章节生成回归测试
Then 至少覆盖 prompt 默认占位符、placeholder 解析、intent 映射、skill 生成成功、validator repair、失败降级、legacy mermaid 兼容、ai-diagram Markdown 输出和导出预处理
```

## Tasks / Subtasks

- [x] **Task 1: 切换章节生成默认占位符到 skill-first** (AC: 1, 6)
  - [x] 1.1 修改 `src/main/prompts/generate-chapter.prompt.ts`：图表插入要求中的默认类型从 `mermaid` 切换为 `skill`，文案强调结构、分组、连线、锚点和标签约束
  - [x] 1.2 修改 `src/main/services/agent-orchestrator/agents/generate-agent.ts` 中 `convertDiagramLikeFencesToPlaceholders()`：AI 直接输出的 Mermaid/ASCII 图统一转为 `%%DIAGRAM:skill:...%%`
  - [x] 1.3 保留 legacy `mermaid` / `drawio` 占位符兼容解析，补充对应单元测试

- [x] **Task 2: 扩展图表类型、路由与 token 映射** (AC: 2, 5)
  - [x] 2.1 修改 `src/main/services/diagram-validation-service.ts`：`DiagramType` 扩展为 `'mermaid' | 'drawio' | 'skill'`
  - [x] 2.2 更新 `parseDiagramPlaceholders()` 与资产文件名生成规则：`skill` 类型默认生成 `ai-diagram-{shortId}.svg`
  - [x] 2.3 修改 `src/main/services/diagram-intent-service.ts`：为 skill-first 路由增加 `AiDiagramTypeToken` / style token 映射函数，输出稳定的 `diagramType`、`style`、`routingReasons`
  - [x] 2.4 将 `state-machine`、`module-dependency` 等缺少一一对应 skill 语法族的语义映射到可执行 token，并在 prompt 中补足结构说明

- [x] **Task 3: 新建主进程 skill 图表生成服务** (AC: 3, 4, 5, 6)
  - [x] 3.1 新建 `src/main/services/skill-diagram-generation-service.ts`
  - [x] 3.2 服务职责：
    - 通过 `skillLoader.getSkill('fireworks-tech-graph')` 和 `skillExecutor.expandPrompt()` 构建 skill prompt
    - 显式加载匹配的 style reference 与 `icons.md`
    - 用稳定位置参数调用 skill：`args = "${style} ${diagramType}"`
    - 提取首个 `<svg>...</svg>` 文档，保留 prompt/style/type 元数据
  - [x] 3.3 接入 `aiDiagramAssetService.saveAiDiagramAsset()`，保存最终 SVG 资产
  - [x] 3.4 复用现有 ai-diagram Markdown 契约，输出 `<!-- ai-diagram:... --> + ![](assets/*.svg)` 片段

- [x] **Task 4: 接入 validator + repair 闭环** (AC: 4, 7)
  - [x] 4.1 在新服务中以临时文件方式调用 `src/main/skills/fireworks-tech-graph/scripts/validate-svg.js`
  - [x] 4.2 增加导出级校验：启动时或首次调用时探测 `rsvg-convert` 能力；可用时执行 `rsvg-convert` 校验，缺失时回退到 `sharp` PNG 栅格化校验，并记录 capability 日志
  - [x] 4.3 为 skill 图表增加 repair loop：同一图表最多 3 次修复，错误详情进入 repair prompt
  - [x] 4.4 失败时输出 `buildDiagramFailureMarkdown()`，错误文案保留 `skill` 类型和原始标题

- [x] **Task 5: 将 generate-agent 章节图表分支切到 skill 输出格式** (AC: 3, 4, 6)
  - [x] 5.1 修改 `src/main/services/agent-orchestrator/agents/generate-agent.ts`：新增 `skill` 分支并调用 `skillDiagramGenerationService`
  - [x] 5.2 保持 `mermaid` / `drawio` 旧分支可运行，已有项目内容继续兼容
  - [x] 5.3 保持现有进度阶段键不变，丰富 message 文案并记录 repair attempt

- [x] **Task 6: 提炼 SVG 提取与主进程质量门工具** (AC: 3, 4)
  - [x] 6.1 将纯字符串层的 `<svg>` 提取逻辑抽到主进程可复用 helper，避免 renderer-only util 直接跨进程引用
  - [x] 6.2 保持 renderer 端 `AiDiagramElement` 的磁盘加载 sanitize 逻辑继续生效，章节生成链路与 Story 3.9 的安全边界一致

- [x] **Task 7: 测试与回归** (AC: 7)
  - [x] 7.1 更新 `tests/unit/main/prompts/generate-chapter.prompt.test.ts`
  - [x] 7.2 更新 `tests/unit/main/services/diagram-validation-service.test.ts`
  - [x] 7.3 更新 `tests/unit/main/services/diagram-intent-service.test.ts`
  - [x] 7.4 新建 `tests/unit/main/services/skill-diagram-generation-service.test.ts`
  - [x] 7.5 更新 `tests/unit/main/services/agent-orchestrator/agents/generate-agent*.test.ts`
  - [x] 7.6 skill 图表成功 → 保存 SVG 资产并产出 ai-diagram Markdown (unit test in skill-diagram-generation-service.test.ts)
  - [x] 7.7 repair 失败 → 章节保留失败块，任务整体完成 (unit test in skill-diagram-generation-service.test.ts)
  - [x] 7.8 环境能力回退覆盖在 service 中 probeRsvgConvert + sharp fallback 实现 (unit test via mocked child_process)

## Dev Notes

### 架构决策

**AI 自动章节图表统一收敛到 Story 3.9 的 ai-diagram 资产模式。** 章节生成阶段产出的 skill 图表将直接写成 `ai-diagram` Markdown 标记并落盘为 `.svg` 资产，这样编辑器预览、文档重载和导出 PNG 预处理都可复用现有实现。

**Skill 的最大能力缺口在运行时编排层。** 当前 `skill-agent` 只负责 prompt 展开和 AI 调用，`fireworks-tech-graph` 自带的 `validate-svg.js`、style references、icons reference 以及 repair 所需脚本都未接入产品链路。Story 3.10 的核心目标是把这些现成能力真正接入运行时。

**本 Story 先打通 quality gate 和 default routing。** `generate-from-template.js` 已具备正交连线和锚点路由能力，当前 vendored skill 目录缺少 `templates/` 资源。3.10 先接入 validator + repair + skill-first 默认路由，模板渲染链路在模板资源补齐后推进为下一条增强故事。

### 当前缺口（实现前必须理解）

1. `generateChapterPrompt()` 仍要求输出 `%%DIAGRAM:mermaid:...%%`
2. `convertDiagramLikeFencesToPlaceholders()` 会把 AI 直接输出的 Mermaid / ASCII 图转换成 `mermaid` 占位符
3. `DiagramType` 当前只有 `mermaid | drawio`
4. `diagram-intent-service` 所有 `preferredType` 都是 `mermaid`
5. `generate-agent` 只支持 Mermaid / draw.io 生成与校验分支
6. `fireworks-tech-graph` 的 `validate-svg.js`、`references/style-*.md` 和 `references/icons.md` 尚未进入运行时链路
7. `skill-executor` 只支持前置 shell 展开，不提供“模型返回后执行脚本”的后处理阶段

### 关键设计模式（必须遵循）

1. **Task Queue 保持单入口** — AI 章节生成继续通过 `chapter-generation-service` / `generate-agent` 跑在任务队列里
2. **主进程完成 skill 图表编排** — 章节生成阶段的 skill 调用、validator、repair、资产保存全部在 main process 完成
3. **ai-diagram Markdown 契约保持唯一** — 章节自动图表与编辑器内手工 AI 图表使用同一标记格式
4. **Legacy 占位符保持兼容** — 旧项目中的 `mermaid` / `drawio` 占位符继续可解析、可生成、可测试
5. **Skill args 使用位置参数** — `skill-executor` 只认 placeholder / positional args，`--style` / `--type` 风格调用不在本仓库契约内
6. **Renderer 安全边界继续生效** — `AiDiagramElement` 从磁盘读取 SVG 时的 sanitize 逻辑继续保留
7. **Stage key 稳定** — `generating-diagrams` / `validating-diagrams` 阶段名保持兼容，UI 文案可以增量丰富
8. **失败块优先于静默回退** — 经过 repair 后仍失败的 skill 图表写为失败块并带原因，章节文本继续产出
9. **路径安全规则复用现有资产服务** — `assetFileName` 保持 basename-only + `.svg`
10. **薄 IPC / 无 renderer 绕路** — 本 Story 主要落在 main process 服务层，不新增 renderer 到 main 的旁路调用
11. **3.9 契约先冻结再复用** — 3.10 依赖 Story 3.9 的 ai-diagram 注释格式、资产命名和导出预处理行为，开发前先确认 3.9 review 结论
12. **导出级校验具备能力回退** — `rsvg-convert` 是优先路径，`sharp` 栅格化校验是稳定回退路径

### 推荐的语义到 Skill Token 映射

| 图表语义 | skill `diagramType` | 默认 style |
|---------|---------------------|-----------|
| `overall-architecture` | `architecture` | `flat-icon` |
| `technical-architecture` | `architecture` | `flat-icon` |
| `business-architecture` | `architecture` | `flat-icon` |
| `integration-architecture` | `architecture` | `flat-icon` |
| `deployment-topology` | `network` | `blueprint` |
| `data-architecture` | `data-flow` | `flat-icon` |
| `process-flow` | `flowchart` | `flat-icon` |
| `sequence-interaction` | `sequence` | `flat-icon` |
| `class-model` | `class` | `flat-icon` |
| `module-dependency` | `class` | `flat-icon` |
| `state-machine` | `flowchart` | `flat-icon` |

### Skill 编排顺序

1. 解析 placeholder，得到 `semantic + style + diagramType`
2. 用 `skillLoader + skillExecutor` 展开 `fireworks-tech-graph` prompt
3. 将 style reference 与 `icons.md` 明确注入 prompt
4. 调用 AI 获取 raw SVG
5. 提取 `<svg>...</svg>`，写入临时文件
6. 执行 `validate-svg.js`
7. 执行导出级校验
8. 失败时进入 repair loop
9. 成功后保存 `assets/ai-diagram-*.svg`
10. 回写 ai-diagram Markdown 片段

### 复用清单（禁止重复造轮子）

| 复用目标 | 源文件 | 复用方式 |
|---------|--------|---------|
| 章节生成 task-queue 链路 | `src/main/services/chapter-generation-service.ts` | 保持现有任务与进度上报模式 |
| 图表 placeholder 解析/替换 | `src/main/services/diagram-validation-service.ts` | 在现有 API 上扩展 `skill` |
| 图表语义判定 | `src/main/services/diagram-intent-service.ts` | 复用规则框架，增加 skill token 映射 |
| AI 图表资产保存 | `src/main/services/ai-diagram-asset-service.ts` | 直接复用 `.svg` 资产 CRUD |
| AI 图表 Markdown 契约 | `src/renderer/src/modules/editor/serializer/markdownSerializer.ts` | 复用 `ai-diagram` 注释 + SVG 图片格式 |
| 导出预处理 | `src/main/services/figure-export-service.ts` | 继续消费 `ai-diagram` SVG 资产 |
| skill prompt 展开 | `src/main/services/skill-engine/skill-loader.ts` / `skill-executor.ts` | 复用 skill 加载与参数替换，不重复造 agent |
| skill 校验脚本 | `src/main/skills/fireworks-tech-graph/scripts/validate-svg.js` | 直接接入质量门 |

### 现有文件修改清单

| 文件 | 修改内容 |
|------|---------|
| `src/main/prompts/generate-chapter.prompt.ts` | 默认图表占位符切到 `skill`，强化图表描述要求 |
| `src/main/services/diagram-validation-service.ts` | 扩展 `DiagramType`、`skill` placeholder、`ai-diagram` 资产命名 |
| `src/main/services/diagram-intent-service.ts` | `preferredType` 切到 skill-first，增加 skill token/style 映射 |
| `src/main/services/agent-orchestrator/agents/generate-agent.ts` | 新增 skill 图表生成分支、repair 流程、进度文案 |
| `src/main/skills/fireworks-tech-graph/SKILL.md` | 显式接入 style/icon references 的运行时说明或可执行 include 片段 |
| `tests/unit/main/prompts/generate-chapter.prompt.test.ts` | 默认 skill 占位符测试 |
| `tests/unit/main/services/diagram-validation-service.test.ts` | `skill` placeholder 与 legacy 兼容测试 |
| `tests/unit/main/services/diagram-intent-service.test.ts` | skill token 映射测试 |
| `tests/unit/main/services/agent-orchestrator/agents/generate-agent*.test.ts` | skill 分支、repair、失败块测试 |

### 新建文件清单

| 文件 | 说明 |
|------|------|
| `src/main/services/skill-diagram-generation-service.ts` | 主进程 skill 图表生成、validator、repair、资产保存编排 |
| `tests/unit/main/services/skill-diagram-generation-service.test.ts` | service 单元测试 |

### Project Structure Notes

- 这条 Story 以 `src/main/services/` 为主，renderer 侧继续复用已有 `ai-diagram` 展示能力
- 所有 AI 调用继续走 `agent-orchestrator` 约束，不新增旁路 AI client
- Prompt 规则仍落在 `src/main/prompts/`
- 新服务命名使用 kebab-case 文件名，导出 service singleton 或纯函数工厂均可，保持与现有 main service 风格一致

### 范围边界

1. 手工 Mermaid void element 编辑功能继续保留
2. Legacy `mermaid` / `drawio` 占位符兼容继续保留
3. 模板驱动 scene-spec 渲染能力在 `templates/` 资源补齐后继续推进
4. 本 Story 的直接目标是 default routing、validator、repair、asset integration

### Dependencies / Risks

1. **Story 3.9 review 依赖** — 3.10 直接复用 ai-diagram 资产格式、导出预处理和 Markdown 注释契约。3.9 review 的最终结论需要先冻结这组契约。
2. **`rsvg-convert` 环境依赖** — 质量门优先使用 `rsvg-convert`。运行环境能力探测与 `sharp` 回退已经纳入 AC 和任务，开发时按双路径实现。
3. **`epics.md` 规划漂移** — 3.9 与 3.10 属于 Epic 3 的后续补强故事，当前以 `sprint-status.yaml` 和 implementation story 文件为执行事实来源，后续 planning sync 再回填 `epics.md`。

### References

- [Source: _bmad-output/implementation-artifacts/analysis-skill-diagram-capability-gap-2026-04-16.md] — 当前 skill 能力缺口分析
- [Source: _bmad-output/implementation-artifacts/3-8-mermaid-diagram-generation.md] — Mermaid 图表前序故事
- [Source: _bmad-output/implementation-artifacts/story-3-9-skill-diagram-editor-integration.md] — ai-diagram 资产、Markdown、导出链路
- [Source: _bmad-output/implementation-artifacts/tech-spec-ai-chapter-diagram-generation.md] — 现有章节图表生成技术方案与 Mermaid-first 假设
- [Source: _bmad-output/implementation-artifacts/tech-spec-skill-engine.md] — skill-engine 运行边界
- [Source: src/main/prompts/generate-chapter.prompt.ts] — 当前章节生成 prompt 与图表占位符约束
- [Source: src/main/services/diagram-validation-service.ts] — placeholder 解析、Mermaid/Draw.io 图表构建逻辑
- [Source: src/main/services/diagram-intent-service.ts] — 图表语义解析与默认路由
- [Source: src/main/services/agent-orchestrator/agents/generate-agent.ts] — 章节生成与图表 repair 主流程
- [Source: src/main/services/skill-engine/skill-executor.ts] — skill 参数替换与 shell 展开规则
- [Source: src/main/services/skill-engine/skill-loader.ts] — skill 载入入口
- [Source: src/main/services/ai-diagram-asset-service.ts] — AI 图表 SVG 资产保存服务
- [Source: src/main/services/figure-export-service.ts] — ai-diagram SVG→PNG 导出预处理
- [Source: src/renderer/src/modules/editor/serializer/markdownSerializer.ts] — ai-diagram Markdown 注释格式
- [Source: src/main/skills/fireworks-tech-graph/SKILL.md] — skill 契约、references、helper scripts
- [Source: src/main/skills/fireworks-tech-graph/scripts/validate-svg.js] — SVG 几何/语法质量门
- [Source: src/main/skills/fireworks-tech-graph/scripts/generate-from-template.js] — 现有正交连线与模板渲染能力

## Change Log

- 2026-04-16: 实现完成，提交 review
  - 默认 AI 章节图表路由从 Mermaid-first 切换到 skill-first
  - 新建 skill-diagram-generation-service 编排 SVG 生成、校验、修复和资产保存
  - DiagramType 扩展支持 `skill`，intent service 全面 skill-first 路由
  - validate-svg.js + rsvg-convert/sharp 双路径质量门接入运行时
  - 1479 测试通过，无回归
- 2026-04-16: 创建 Story 3.10
  - 将 Epic 3 的 AI 自动章节图表默认策略从 Mermaid-first 调整为 skill-first
  - 范围聚焦在 validator + repair + ai-diagram 资产复用
  - 保留 Mermaid / draw.io 旧内容兼容与手工 Mermaid 编辑路径
- 2026-04-16: 风险补强修订
  - 加入 Story 3.9 契约冻结依赖说明
  - 将导出级校验明确为 `rsvg-convert` 优先、`sharp` 回退
  - 补充 planning drift 说明：`sprint-status.yaml` 与 story 文件是当前执行事实来源

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Debug Log References

### Completion Notes List

- ✅ Task 1: 默认占位符从 `%%DIAGRAM:mermaid:...%%` 切换到 `%%DIAGRAM:skill:...%%`，prompt 强调组件、分组、关系和连线约束描述
- ✅ Task 2: `DiagramType` 扩展为 `'mermaid' | 'drawio' | 'skill'`，intent service 全面路由到 skill-first，新增 `resolveSkillTokens()` 映射 11 种语义到稳定 skill token
- ✅ Task 3: 新建 `skill-diagram-generation-service.ts`，编排 skill prompt 展开 → AI 调用 → SVG 提取 → 校验 → 资产保存 → ai-diagram Markdown 输出
- ✅ Task 4: validate-svg.js 通过临时文件接入，rsvg-convert 能力探测 + sharp 回退，repair loop 最多 3 次
- ✅ Task 5: generate-agent 新增 skill 分支，legacy mermaid/drawio 分支保留兼容
- ✅ Task 6: SVG 提取逻辑抽到 `src/main/utils/svg-extract.ts`
- ✅ Task 7: 1479 个相关测试全部通过，新增 skill service 测试 5 条 + SVG extract 测试 6 条 + 更新现有测试适配 skill-first 路由

### File List

**新建文件：**
- `src/main/services/skill-diagram-generation-service.ts`
- `src/main/utils/svg-extract.ts`
- `tests/unit/main/services/skill-diagram-generation-service.test.ts`
- `tests/unit/main/utils/svg-extract.test.ts`

**修改文件：**
- `src/main/prompts/generate-chapter.prompt.ts`
- `src/main/services/diagram-validation-service.ts`
- `src/main/services/diagram-intent-service.ts`
- `src/main/services/agent-orchestrator/agents/generate-agent.ts`
- `tests/unit/main/prompts/generate-chapter.prompt.test.ts`
- `tests/unit/main/services/diagram-validation-service.test.ts`
- `tests/unit/main/services/diagram-intent-service.test.ts`
- `tests/unit/main/services/agent-orchestrator/agents/generate-agent.test.ts`
- `tests/unit/main/services/agent-orchestrator/agents/generate-agent.batch.test.ts`
- `tests/unit/main/services/agent-orchestrator/agents/generate-agent.skeleton.test.ts`
