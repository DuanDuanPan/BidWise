---
stepsCompleted: ['step-01', 'step-02', 'step-03', 'step-04']
status: 'complete'
completedAt: '2026-03-18'
totalEpics: 10
totalStories: 66
frCoverage: '69/69 = 100%'
pendingEnhancements: []
revisionNote: '2026-03-18 结构性修订：Epic 6 cost-only / Enabler 标记 / Story 拆分 / 无障碍+Cmd+K 补齐 / MVP 角色范围对齐'
inputDocuments:
  - '_bmad-output/planning-artifacts/prd.md'
  - '_bmad-output/planning-artifacts/architecture.md'
  - '_bmad-output/planning-artifacts/ux-design-specification.md'
---

# BidWise - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for BidWise（标智）, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: 售前工程师可以创建、查看、编辑和归档投标项目
FR2: 售前工程师可以在项目看板上同时查看所有进行中的投标项目及其 SOP 阶段状态
FR3: 系统可以按截止日、紧急度和 SOP 阶段自动排列多项目待办优先级
FR4: 售前工程师可以选择方案类型（MVP 阶段：售前技术方案）创建项目
FR5: 系统可以按 SOP 6 阶段引导用户完成投标全流程，每阶段提供目标说明和操作提示
FR6: 系统可以将项目数据隔离，确保多标并行时上下文互不干扰
FR7: 售前工程师可以按客户、行业、状态、截止日等维度筛选和过滤项目列表
FR8: 系统可以将数据分为公司级（资产库/术语库/模板/基线，跨项目共享）和项目级（方案/批注/对抗结果/GAP，项目内隔离）两层管理
FR9: 售前工程师可以导入招标文件（PDF/Word），系统异步解析并显示进度
FR10: 系统可以对扫描件 PDF 执行 OCR 识别，并支持人工校正 OCR 结果
FR11: 系统可以从招标文件中结构化抽取技术需求条目清单
FR12: 系统可以通过 LLM 动态理解并抽取评分标准，生成逐项可解释的评分模型
FR13: 系统可以自动识别必响应项（*项）并以高亮方式标注（召回率 100%）
FR14: 售前工程师可以导入客户沟通素材（会议纪要/邮件/文本记录），系统生成策略种子
FR15: 售前工程师可以查看、确认和调整策略种子后再驱动方案生成
FR16: 系统可以建立招标需求与方案内容之间的双向追溯矩阵
FR17: 系统可以解析招标补遗/变更通知，并通过追溯矩阵精确定位受影响的方案章节
FR18: 系统可以生成招标"迷雾地图"——将需求分为明确区域、模糊区域和风险区域，引导售前工程师对模糊/风险区域进行定向确认
FR19: 系统可以基于选定模板反向生成方案章节骨架，并按评分权重标注重点章节
FR20: 系统可以按章节独立生成 AI 方案内容，支持带上下文补充的章节级重新生成
FR21: 系统可以对 AI 生成内容标注来源（资产库引用/知识库匹配/AI 推理），无来源内容高亮提醒人工确认
FR22: 系统可以将 AI 生成的产品功能描述与基础产品能力基线交叉验证，不匹配项自动标红
FR23: 系统可以在生成方案时应用可配置的文风模板（含用语规范、禁用词列表、句式约束），以满足军工文风要求
FR24: 售前工程师可以使用富文本编辑器编辑方案内容，支持 Markdown 与所见即所得切换
FR25: 售前工程师可以在编辑器内嵌入和编辑 draw.io 架构图
FR26: 售前工程师可以通过 Mermaid 语法快速生成架构图草图
FR27: 系统可以支持批注式双向人机协作：AI 向用户添加批注（建议/预警/对抗反馈），用户向 AI 添加批注（指令/补充/驳回）
FR28: 系统可以对批注按来源分层着色（AI 建议/评分预警/对抗反馈/人工批注/跨角色指导）
FR29: 售前工程师可以将批注标记为"待决策"并请求其他用户在批注中指导
FR30: 系统可以向相关用户发送跨角色批注通知
FR31: 售前工程师可以通过标签和语义检索资产库中的文字片段、架构图、表格和案例
FR32: 系统可以基于当前方案上下文智能推荐相关资产（标签+语义匹配）
FR33: 售前工程师可以将方案片段一键入库资产库，并标注标签
FR34: 售前工程师可以修正资产库中自动生成的标签
FR35: 售前工程师可以维护行业术语库（添加/编辑术语对照），系统在方案生成时自动应用术语替换
FR36: 管理员可以通过冷启动向导批量导入历史 Word 方案，系统自动解析、拆分章节、生成标签并提取 draw.io 源文件
FR37: 管理员可以导入基础产品能力基线（Excel/JSON 格式），系统解析为结构化功能清单
FR38: 管理员可以通过模板注册向导上传公司 Word 模板，系统自动识别样式清单，用户确认映射关系后生成测试文档验证
FR39: 系统可以对比方案需求与基础产品能力基线，自动识别 GAP 清单
FR40: 系统可以基于 GAP 清单按 4 号文标准估算定制化工作量
FR41: 商务经理可以查看结构化的 GAP 清单、4 号文估算结果和成本汇总
FR42: 商务经理可以使用 What-if 模拟器调整功能模块方案，即时查看成本变化和评分影响预估
FR43: 商务经理可以在成本视图中通过批注与售前工程师沟通调整建议，方案和成本联动更新
FR44: 系统可以在方案生成前执行"先评后写"——先让对抗 Agent 基于招标文件和策略种子生成"攻击清单"，供售前工程师在撰写时进行防御性写作
FR45: 系统可以根据招标文件、评分标准、策略种子和方案类型，通过 LLM 动态生成对抗评审角色（含角色名称、视角、攻击焦点、强度）
FR46: 售前工程师可以查看、确认、增删和调整动态生成的对抗角色后执行对抗评审
FR47: 系统可以确保合规审查角色始终存在于对抗阵容中（保底机制）
FR48: 系统可以识别对抗角色之间的矛盾攻击，高亮为人类决策点（交叉火力）
FR49: 系统可以执行*项合规三层校验：解析时识别 + 编辑时合规校验 + 导出前最终拦截
FR50: 系统可以对方案进行相似度检测，防止多标并行时的围标风险
FR51: 系统可以校验方案是否符合公司模板规范（字体/页眉/页码/Logo）
FR52: 系统可以展示实时评分仪表盘，预估各评分项得分并说明每项得分的依据（对应的方案内容位置+评分标准条款）
FR53: 售前工程师可以在导出前预览方案的最终 docx 效果
FR54: 系统可以将方案从编辑态一键导出为精确模板化的 docx 文档，样式映射 100% 合规
FR55: 系统可以在导出时将 draw.io 架构图自动转换为高清 PNG 插入
FR56: 系统可以在导出时自动生成图表编号和交叉引用
FR57: 系统可以在检测到格式问题时提供降级方案（在 docx 中插入标注提醒人工修复）
FR58: 系统可以随方案导出合规性验证报告
FR59: IT 管理员可以通过静默安装脚本批量部署 BidWise（预置 AI 配置+Git 仓库地址）
FR60: IT 管理员可以在管理员初始化向导中配置 AI 代理层（API Key + 脱敏策略）
FR61: 系统可以通过内部 Git 仓库同步公司级共享数据（资产库/模板库/术语库），用户界面为"自动同步"，冲突通过可视化界面解决
FR62: IT 管理员可以通过管理员面板一键推送版本更新，客户端在空闲时段静默执行
FR63: 系统可以在更新后首次启动时自动校验核心功能，校验失败自动回滚到上一版本并通知管理员
FR64: 系统可以在 AI API Key 即将过期时提前 7 天向管理员告警
FR65: 系统可以通过本地定时任务自动备份数据到管理员配置的路径
FR66: 系统可以在用户修改 AI 生成内容、驳回批注、做出交叉火力决策时，自动捕获修改 diff 和决策上下文，经用户一键确认后沉淀为组织经验
FR67: 系统可以将捕获的经验存储为时序知识图谱（实体+关系+时间窗口+置信度），支持按行业/客户/章节类型/项目类型维度检索
FR68: 系统可以在 AI 生成方案内容和执行对抗评审前，自动查询经验图谱获取相关历史经验，注入到 AI 上下文中防止重复犯错
FR69: 系统可以在 AI 生成的内容命中历史"被驳回"模式时，自动附加橙色预警批注提示用户

### NonFunctional Requirements

NFR1: 应用启动时间——冷启动到可操作 <5 秒
NFR2: 招标文件解析——100 页 PDF <15 分钟（含 OCR），异步处理+进度反馈，不阻塞用户操作
NFR3: AI 单章节生成——<2 分钟/章节
NFR4: 资产库检索响应——<3 秒（2000+ 资产片段规模下），含标签+语义匹配
NFR5: docx 导出——100 页方案导出 <30 秒
NFR6: 编辑器输入响应——按键到渲染 <100ms
NFR7: 对抗评审执行——全方案对抗 <5 分钟，多角色并行攻击
NFR8: What-if 模拟响应——参数调整到结果更新 <3 秒
NFR9: 数据本地存储——方案全文、资产、元数据 100% 存储在本地，方案内容永不上传云端
NFR10: AI 调用脱敏——敏感字段（公司名/客户名/金额/技术参数）在发送前自动替换，返回后自动还原，脱敏策略可配置
NFR11: 敏感数据泄露事件——零
NFR12: Electron IPC 隔离——主进程与渲染进程通过 contextBridge 安全隔离
NFR13: 方案文件格式——Markdown 纯文本存储，人机可读，任何时候可用标准编辑器打开
NFR14: Git 同步安全——公司级数据仅通过内部 GitLab 同步，不经过公网
NFR15: AI 生成请求成功率——>99%，含 API 超时、本地处理异常的容错
NFR16: docx 导出完整性——100%，图片不丢、格式不乱、编号正确、样式精确映射
NFR17: 数据持久性——编辑内容实时自动保存，应用崩溃后零数据丢失
NFR18: 更新回滚——更新失败自动检测+自动回滚到上一版本
NFR19: 本地备份——自动定时备份到管理员配置路径，备份频率可配置，默认每日
NFR20: 章节级容错——单章节 AI 生成失败不影响其他章节和全局功能
NFR21: 格式降级保障——docx 导出检测到格式问题时提供标注式降级方案而非导出失败
NFR22: AI API 兼容性——支持 Claude 和 OpenAI API，可切换
NFR23: AI API 超时处理——API 调用超时 <30 秒自动重试，3 次失败后优雅降级提示用户
NFR24: Git 同步冲突率——自动合并成功率 >95%，冲突通过可视化界面解决
NFR25: OCR 中文识别准确率——>95%（标准印刷体），手写体/模糊扫描件可人工校正
NFR26: 文件格式兼容性——招标文件支持 PDF（含扫描件）和 Word（.docx/.doc）导入
NFR27: python-docx 渲染引擎独立更新——docx 渲染引擎可独立于 Electron 主应用升级
NFR28: 跨平台一致性——Windows 和 macOS 上功能行为、docx 导出结果一致
NFR29: 大数据量稳定性——200+ 方案、2000+ 资产片段下系统响应时间不超过正常值 2 倍

### Additional Requirements

**Starter 模板（Epic 1 Story 1 关键输入）：**
- 架构指定使用 electron-vite 作为 Starter 模板，初始化命令：`pnpm create @quick-start/electron bidwise -- --template react-ts`
- 必须在项目初始化时配置 `.npmrc`（shamefully-hoist=true）解决 pnpm + electron-builder 依赖兼容问题

**数据层：**
- better-sqlite3 + Kysely + Kysely Migrator 数据库访问层，启动时自动执行 `migrator.migrateToLatest()`
- Kysely CamelCasePlugin 自动 snake_case ↔ camelCase 转换，禁止手动映射

**状态管理：**
- Zustand 按领域划分多个 store（projectStore / documentStore / analysisStore / annotationStore / reviewStore / costStore）
- 跨 Store 通信通过 `subscribeWithSelector` + 组件层 hooks，禁止 Action 内跨 store 调用

**通信架构：**
- Electron IPC：原生 ipcMain/ipcRenderer + 手动 TypeScript 类型定义，handler 按 service 域名组织
- Python 进程通信：FastAPI over localhost HTTP（随机端口，启动时协商），主进程管理 Python 进程生命周期
- 统一 Response Wrapper：`{ success: true, data: T }` / `{ success: false, error: { code, message } }`

**AI 系统：**
- AI 脱敏代理层：双层策略（正则基线 + NER 模型智能增强）
- API Key 存储：本地 AES-256 加密配置文件，加密密钥派生自机器标识
- Agent 编排层从 Alpha 第一天存在，核心接口：registerAgent / executeAgent / getAgentStatus
- 所有 AI 调用必须经过 agent-orchestrator，禁止直接调用 API
- Prompt 文件规范：`.prompt.ts` 导出 `(context: T) => string` 类型化函数，集中在 `src/main/prompts/`

**Markdown 扩展规范：**
- 纯净 Markdown + sidecar JSON 元数据（proposal.md + proposal.meta.json）
- 图表/资产用标准 Markdown 图片语法内联，元数据通过 section ID/锚点引用

**测试框架：**
- Vitest（主进程+渲染进程单元/集成测试）+ Playwright（E2E，原生支持 Electron）+ pytest（Python docx 渲染引擎）
- 共享测试数据在 `tests/fixtures/`

**实现模式强制规则：**
- 路径别名（@main/*, @renderer/*, @shared/*, @modules/*），禁止相对路径超过 1 层（禁止 ../../）
- 所有日期时间 ISO-8601 格式
- 所有错误使用 BidWiseError 类型体系，禁止 throw 裸字符串
- 异步任务白名单必须走 task-queue：AI Agent 调用/OCR/批量导入/docx 导出/Git 同步/语义检索
- Loading 状态统一用 `loading: boolean`，禁止 isLoading/fetching/pending 等不一致命名

**Alpha/Beta/RC 模块激活对齐：**
- Alpha：project, analysis, editor, export 模块 + ai-proxy, agent-orchestrator, document-parser, docx-bridge, task-queue 服务
- Beta：+ cost, review, asset 模块 + git-sync 服务
- RC：+ admin 模块，全部完善

### UX Design Requirements

UX-DR1: 设计系统搭建——Ant Design 5.x + Tailwind CSS 混合架构集成，Ant Design 覆盖标准 UI 组件（约 60%），Tailwind 覆盖高度定制化区域（编辑器/批注/对抗面板）
UX-DR2: Design Token 全局定制——减少组件边框和阴影深度（趋向极简风格）、加大内容区间距和留白、中文排版优化字体体系、批注五色编码+SOP 四态颜色叠加到 Ant Design 基础色上
UX-DR3: 色彩系统实现——品牌主色 #1677FF、品牌辅色 #F0F5FF、语义色（成功 #52C41A / 警告 #FAAD14 / 危险 #FF4D4F / 信息 #1677FF）、批注五色编码（蓝/绿/橙/红/紫）、SOP 四态色（灰/蓝/绿/橙）、界面底色分层（全局 #FAFAFA / 内容 #FFFFFF / 侧栏 #F5F5F5）
UX-DR4: 字体系统实现——正文/UI 使用系统中文字体（PingFang SC / Microsoft YaHei），代码/技术参数使用 JetBrains Mono 等宽字体，方案正文行高 1.8（高于常规 UI 的 1.5），字号层级 H1-24px/H2-20px/H3-16px/H4-14px/Body-14px/Small-12px
UX-DR5: 间距系统实现——8px 基准网格（xs-4px / sm-8px / md-16px / lg-24px / xl-32px / 2xl-48px）
UX-DR6: 工作空间核心布局——SOP 进度条（固定顶部 48px）+ 文档大纲树（左侧 240px 可折叠）+ 主编辑区（弹性宽度 min 600px，内容限宽 800px）+ 智能批注侧边栏（右侧 320px 可折叠）+ 状态栏（固定底部 32px）
UX-DR7: 项目看板布局——顶部导航（56px，Logo+全局搜索+设置）+ 左侧智能待办面板（320px）+ 右侧项目卡片网格（弹性宽度）
UX-DR8: SOP 进度条组件——基于 Ant Design Steps 深度定制，4 种阶段状态视觉映射（未开始灰色空心圆/进行中蓝色脉冲动画/已完成绿色勾选/有警告橙色感叹号），可点击跳转带约束提示，紧凑布局；Beta 阶段切换为深色背景（#0C1D3A）定制主题
UX-DR9: 批注卡片组件——单条批注展示和操作容器，五色变体（蓝/绿/橙/红/紫），每色有专属操作按钮组（蓝:采纳/驳回/修改，绿:插入/忽略/查看，橙:处理/标记待决策，红:接受并修改/反驳/请求指导，紫:标记已处理/回复），状态流转待处理→已处理/已驳回/待决策，键盘按 UX-DR27 使用 Alt+↑/↓ 导航、Alt+Enter 采纳、Alt+Backspace 驳回、Alt+D 标记待决策
UX-DR10: 智能批注面板组件——右侧固定侧边栏，按上下文优先级排序（当前 SOP 阶段+编辑位置+批注类型权重动态决定），含类型过滤器（5 个着色圆点按钮）+状态过滤器（待处理/已处理/待决策）+计数器，零批注状态展示"审查完毕，未发现问题"，过载应急（>15 条时提供逐条/重新生成/摘要三选一）
UX-DR11: 交叉火力决策卡片组件——矛盾批注对专属展示容器，⚡矛盾标签+左右两条矛盾批注+中间决策输入框，动效灰→红 500ms 过渡+轻微震动+标签浮现，状态待决策（红色边框闪烁）→已决策（绿色边框+执行结果摘要）
UX-DR12: 批注内微对话组件——批注线程中向系统提问能力，批注卡片底部"向系统提问"入口→输入问题→Streaming 回答→答案作为系统批注出现，基于产品能力基线/资产库回答
UX-DR13: 评分仪表盘组件——双形态：状态栏形态（合规分实时跳动+质量分手动刷新+*项覆盖率）和面板形态（逐项评分明细+推理依据+趋势图），分数动效上升绿色发光/下降红色发光，分数颜色映射绿>80/橙60-80/红<60
UX-DR14: 合规覆盖矩阵组件——需求条目×方案章节交叉矩阵，单元格着色（已覆盖绿/未覆盖红/部分覆盖橙），点击未覆盖项跳转到对应章节，全绿时逐项翻绿闪烁动效
UX-DR15: AI 生成进度指示器组件——展示 AI 工作阶段进度（解析→匹配→生成→标注），变体：章节内联/侧边栏顶部/全局进度条，状态进行中脉冲→完成绿色勾选→失败红色错误条
UX-DR16: 来源标注标签组件——AI 生成内容旁 12px 内联标签，变体：资产库蓝底/知识库绿底/AI 推理橙底/无来源黄色高亮背景，点击展开来源详情
UX-DR17: 策略种子卡片组件——展示从客户沟通素材提取的隐性需求，内容：种子标题+推理依据+策略建议，状态待确认→已确认→已调整
UX-DR18: 迷雾地图组件——需求分析阶段的需求确定性可视化，三色着色（绿色明确/黄色模糊/红色风险），点击模糊/风险项展开详情+引导确认
UX-DR19: What-if 模拟器面板组件——成本评估交互式模拟工具，左侧功能模块列表（可切换方案变体），右侧成本变化+评分影响实时联动更新，支持多方案对比
UX-DR20: OCR 校正界面组件——扫描件识别校正工具，左侧原始扫描图+右侧识别文本对照视图，低置信度区域黄色高亮，逐段校正或批量确认
UX-DR21: 格式问题清单面板组件——docx 导出前/后格式问题展示，逐项列出问题描述+定位按钮+修复指南，支持"降级导出"选项
UX-DR22: 自定义图标集——5 个批注类型图标（16px/20px，单色线性，与颜色编码配合）+ 6 个 SOP 阶段图标（16px，表意清晰）+ 交叉火力图标（双箭头交叉/闪电）+ 3 个来源类型图标（12px 内联），线性风格 1.5px 线宽圆角端点
UX-DR23: 动效规范实现——微交互 150-200ms ease-out、面板过渡 300ms ease-in-out、内容过渡 300-400ms ease-out、复杂动画 500ms（交叉火力灰→红/评分变化/进度推进）、骨架屏淡入 200ms；关键场景含 SOP 阶段完成过渡、对抗结果流入滑入、合规全绿逐项翻绿、评分上升数字滚动
UX-DR24: 无障碍合规——WCAG 2.1 AA 级别，色彩对比度（正文 4.5:1/大字 3:1）、批注三重编码（图标+颜色+文字标签不单靠颜色）、键盘可达性（Tab 导航+快捷键+命令面板）、焦点指示蓝色 2px outline、屏幕阅读器支持（语义 HTML+ARIA 标签+实时区域通知）、字号可调 12/14/16px 三档、动效安全检测 prefers-reduced-motion
UX-DR25: 桌面分辨率适配——紧凑模式 <1440px（大纲折叠，批注折叠为图标+Badge）、标准模式 1440-1920px（三栏正常）、宽屏模式 >1920px（三栏不变，多余空间留白），窗口低于 1200px 自动触发紧凑模式
UX-DR26: 跨平台一致性——Windows/macOS 字体渲染分平台字体栈、高 DPI 用 rem+SVG 适配、快捷键 Ctrl↔Cmd 自动适配、Electron 原生窗口控制
UX-DR27: 快捷键体系——全局快捷键（Cmd/Ctrl+K 命令面板、Cmd/Ctrl+S 拦截显示已自动保存、Cmd/Ctrl+E 导出、Cmd/Ctrl+B 切换批注、Cmd/Ctrl+\ 切换大纲）+ 编辑器快捷键（Cmd/Ctrl+Shift+G 重新生成章节、Cmd/Ctrl+/ 插入批注）+ 批注导航（Alt+↑↓ 上下条、Alt+Enter 采纳、Alt+Backspace 驳回、Alt+D 标记待决策）+ SOP 导航（Alt+2~6 跳转阶段）
UX-DR28: 混合设计方向实现——A 的深色 SOP 顶栏（#0C1D3A）+ B 的白色极简编辑区 + A 的独立批注侧边栏 + 深色状态栏与 SOP 栏呼应，形成"上下深色包夹+中间白色内容"的视觉框架
UX-DR29: 空状态设计——每个 SOP 阶段"未开始"时展示引导式占位符（阶段目标说明+开始操作入口），而非空白页；冷启动两阶段设计（即时体验 5 分钟到 Wow + 深度初始化后台异步）
UX-DR30: 模态策略——侧边面板用于不打断主编辑流的操作（策略种子确认/对抗角色调整/批注详情）、内联展开用于章节级操作、模态对话框仅用于不可逆/高风险操作（导出确认/删除项目/冷启动向导步骤）、Toast 用于异步完成非阻塞提醒

### FR Coverage Map

FR1: Epic 1 - 创建、查看、编辑和归档投标项目
FR2: Epic 1 - 项目看板查看所有进行中投标项目及 SOP 阶段状态
FR3: Epic 1 - 按截止日、紧急度和 SOP 阶段自动排列待办优先级
FR4: Epic 1 - 选择方案类型创建项目
FR5: Epic 1 - SOP 6 阶段引导用户完成投标全流程
FR6: Epic 1 - 项目数据隔离，多标并行上下文互不干扰
FR7: Epic 1 - 按客户、行业、状态、截止日筛选过滤项目
FR8: Epic 1 - 数据分公司级和项目级两层管理
FR9: Epic 2 - 导入招标文件，系统异步解析并显示进度
FR10: Epic 2 - 扫描件 PDF OCR 识别及人工校正
FR11: Epic 2 - 从招标文件结构化抽取技术需求条目清单
FR12: Epic 2 - LLM 动态理解抽取评分标准，生成逐项可解释评分模型
FR13: Epic 2 - 自动识别必响应项（*项）并高亮标注
FR14: Epic 2 - 导入客户沟通素材，系统生成策略种子
FR15: Epic 2 - 查看、确认和调整策略种子
FR16: Epic 2 - 建立招标需求与方案内容双向追溯矩阵
FR17: Epic 2 - 解析招标补遗/变更通知，定位受影响章节
FR18: Epic 2 - 生成招标"迷雾地图"
FR19: Epic 3 - 基于模板反向生成方案章节骨架，标注重点章节
FR20: Epic 3 - 按章节独立生成 AI 方案内容，支持章节级重新生成
FR21: Epic 3 - AI 生成内容标注来源，无来源内容高亮提醒
FR22: Epic 3 - AI 生成产品功能描述与基线交叉验证
FR23: Epic 3 - 方案生成应用可配置文风模板
FR24: Epic 3 - 富文本编辑器编辑方案内容
FR25: Epic 3 - 编辑器内嵌入和编辑 draw.io 架构图
FR26: Epic 3 - 通过 Mermaid 语法快速生成架构图草图
FR27: Epic 4 - 批注式双向人机协作
FR28: Epic 4 - 批注按来源分层着色
FR29: Epic 4 - 批注标记"待决策"并请求他人指导
FR30: Epic 4 - 向相关用户发送跨角色批注通知
FR31: Epic 5 - 通过标签和语义检索资产库
FR32: Epic 5 - 基于方案上下文智能推荐相关资产
FR33: Epic 5 - 方案片段一键入库资产库
FR34: Epic 5 - 修正资产库中自动生成的标签
FR35: Epic 5 - 维护行业术语库，方案生成时自动应用
FR36: Epic 5 - 冷启动向导批量导入历史 Word 方案
FR37: Epic 5 - 导入基础产品能力基线
FR38: Epic 5 - 模板注册向导
FR39: Epic 6 - 对比方案需求与基线，自动识别 GAP 清单
FR40: Epic 6 - 基于 GAP 按 4 号文标准估算工作量
FR41: Epic 6 - 查看 GAP 清单、4 号文估算和成本汇总
FR42: Epic 6 Story 6.3（cost-only 模拟）+ Epic 7 Story 7.9（评分影响集成）— What-if 模拟器完整交付
FR43: Epic 6 - 成本视图批注与售前沟通，方案成本联动
FR44: Epic 7 - 方案生成前"先评后写"攻击清单
FR45: Epic 7 - LLM 动态生成对抗评审角色
FR46: Epic 7 - 查看、确认、增删调整对抗角色后执行评审
FR47: Epic 7 - 合规审查角色始终保底
FR48: Epic 7 - 识别对抗矛盾攻击，高亮为人类决策点（交叉火力）
FR49: Epic 7 - *项合规三层校验
FR50: Epic 7 - 方案相似度检测，防围标
FR51: Epic 7 - 校验方案是否符合公司模板规范
FR52: Epic 7 - 实时评分仪表盘，预估各评分项得分及依据
FR53: Epic 8 - 导出前预览方案最终 docx 效果
FR54: Epic 8 - 一键导出精确模板化 docx，样式 100% 合规
FR55: Epic 8 - 导出时 draw.io 架构图自动转换高清 PNG
FR56: Epic 8 - 导出时自动生成图表编号和交叉引用
FR57: Epic 8 - 格式问题降级方案
FR58: Epic 8 - 随方案导出合规性验证报告
FR59: Epic 9 - 静默安装脚本批量部署
FR60: Epic 9 - 管理员初始化向导配置 AI 代理层
FR61: Epic 9 - Git 仓库同步公司级共享数据
FR62: Epic 9 - 管理员面板一键推送版本更新
FR63: Epic 9 - 更新后自动校验，失败自动回滚
FR64: Epic 9 - AI API Key 过期提前 7 天告警
FR65: Epic 9 - 本地定时任务自动备份数据
FR66: Epic 10 - 经验自动捕获（修改 diff + 决策上下文 → 用户确认 → 沉淀）
FR67: Epic 10 - 经验知识图谱基础设施（Graphiti + Kuzu 时序图谱存储与检索）
FR68: Epic 10 - AI 生成/评审前自动查询经验图谱注入上下文
FR69: Epic 10 - 命中历史驳回模式时自动附加预警批注

## Epic List

**MVP 范围边界：** 当前 backlog 实施范围为 MVP（Alpha→Beta→RC），目标角色为售前工程师的完整体验。Epic 6 成本能力和 Epic 9 管理能力为"共享视图/基础能力"，不构建独立角色工作台。独立商务经理/IT 管理员/售前总监工作台延迟到 V1.0+（与 UX 规范 §执行摘要 对齐）。

### Epic 1: 应用基座与投标项目管理
售前工程师可以启动 BidWise，创建和管理投标项目，在项目看板上纵览所有进行中的标，通过 SOP 6 阶段导航完成投标全流程。
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR8

### Epic 2: 招标文件分析与需求智能
售前工程师可以上传招标文件，系统自动解析出结构化需求清单、评分模型和*项高亮；可以导入客户沟通素材生成策略种子；可以通过追溯矩阵和迷雾地图深度理解招标需求。
**FRs covered:** FR9, FR10, FR11, FR12, FR13, FR14, FR15, FR16, FR17, FR18

### Epic 3: AI 方案生成与富文本编辑
售前工程师可以基于模板生成方案骨架，AI 逐章生成内容并标注来源，使用 Plate 富文本编辑器编辑方案，内嵌 draw.io 架构图和 Mermaid 图，来源标注和基线交叉验证确保 AI 输出可信。
**FRs covered:** FR19, FR20, FR21, FR22, FR23, FR24, FR25, FR26

### Epic 4: 批注式人机协作
售前工程师可以通过批注系统与 AI 双向协作——AI 添加建议/预警/对抗反馈，用户回复指令/补充/驳回；批注按来源五色着色，可标记"待决策"并请求他人指导，跨角色通知确保协作流畅。
**FRs covered:** FR27, FR28, FR29, FR30

### Epic 5: 资产与知识管理
售前工程师可以检索和复用历史方案片段，一键入库优质素材，维护行业术语库自动应用；管理员可以通过冷启动向导批量导入历史方案、导入能力基线、注册公司模板。
**FRs covered:** FR31, FR32, FR33, FR34, FR35, FR36, FR37, FR38

### Epic 6: 成本评估与 GAP 模拟
系统自动识别方案与产品基线的 GAP，按 4 号文标准估算工作量；售前工程师（共享视图）可以通过 What-if 模拟器调整功能方案、即时查看成本变化，通过批注与商务经理协作。无独立商务经理工作台（延迟到 V1.0+），成本视图为售前工程师自用工具+跨角色批注共享。评分影响联动在 Epic 7 评分能力就绪后增量集成。
**FRs covered:** FR39, FR40, FR41, FR42, FR43

### Epic 7: 质量保障、对抗评审与合规
系统通过 LLM 动态生成多维对抗角色，执行红方攻击；交叉火力矛盾高亮为用户决策点；*项三层合规校验确保零遗漏；查重防围标；评分仪表盘实时展示预估得分和依据。
**FRs covered:** FR44, FR45, FR46, FR47, FR48, FR49, FR50, FR51, FR52

### Epic 8: 文档导出与交付
售前工程师可以预览方案最终效果，一键导出精确模板化 docx，draw.io 图自动转 PNG 高清插入，图表自动编号，格式问题提供降级方案确保截止日前一定能产出。
**FRs covered:** FR53, FR54, FR55, FR56, FR57, FR58

### Epic 9: 系统管理与部署运维
具备管理员权限的用户可以通过静默安装脚本批量部署，配置 AI 代理层和脱敏策略，通过 Git 同步公司级数据，一键推送版本更新并支持自动回滚，API Key 过期提前告警，数据自动备份。当前为基础管理能力，无独立 IT 管理员工作台（延迟到 V1.0+）。
**FRs covered:** FR59, FR60, FR61, FR62, FR63, FR64, FR65

### Epic 10: 经验沉淀飞轮
系统从每次人机协作中自动学习——用户的修正、驳回、决策经验沉淀为时序知识图谱，AI 生成和评审时自动查询历史经验防止重复犯错，越用越聪明。
**FRs covered:** FR66, FR67, FR68, FR69

**重要说明：**
- Epic 编号是逻辑分组，不等于实施顺序。Alpha 需要从 Epic 1/2/3/4/7/8 各抽关键 Story 组成核心链路验证。
- NFR 和 UX-DR 将在 Story 级别做显式关联。
- Alpha 阶段 AI 调用日志+用户修改 diff 记录积累数据基础，Epic 10 正式能力在 Beta 阶段引入。

## Epic 1: 应用基座与投标项目管理

售前工程师可以启动 BidWise，创建和管理投标项目，在项目看板上纵览所有进行中的标，通过 SOP 6 阶段导航完成投标全流程。

> Story 1.1-1.3 为 Technical Enabler，交付应用基础框架；Story 1.4 起为用户价值 Story。

### Story 1.1: [Enabler] 项目初始化与工程配置

As a 开发者,
I want BidWise 项目正确初始化并完成工程配置,
So that 开发团队可以在规范化的工程基础上开始构建功能。

**Acceptance Criteria:**

**Given** 项目尚未创建
**When** 初始化执行
**Then** 生成包含 main/preload/renderer 三层分离的 Electron + React + TypeScript 项目

**Given** 项目已创建
**When** 运行开发服务器
**Then** Electron 窗口正常启动，HMR 热更新工作正常

**Given** 应用打包后冷启动
**When** 用户双击启动
**Then** 冷启动到可操作 <5 秒（NFR1）

**Given** 路径别名已配置
**When** 代码中使用跨目录 import
**Then** 路径别名正确解析，不使用超过 1 层的相对路径

**Given** 代码规范工具已配置
**When** 提交代码
**Then** 代码检查通过，目录结构匹配架构规范

**Given** 测试框架已配置
**When** 运行测试命令
**Then** 单元测试和 E2E 测试基础配置就绪，可运行首个冒烟测试

**Implementation Notes:**
- 使用 `pnpm create @quick-start/electron bidwise -- --template react-ts`
- `.npmrc` 配置 `shamefully-hoist=true`
- 路径别名：`@main/*`、`@renderer/*`、`@shared/*`、`@modules/*`（tsconfig + electron.vite.config）
- ESLint + Prettier + Vitest + Playwright 基础配置
- 目录结构参照 architecture.md 代码组织结构

### Story 1.2: [Enabler] 数据持久层与迁移基础设施

As a 开发者,
I want 类型安全的数据库访问层和自动迁移机制,
So that 所有功能可以使用一致的模式可靠地持久化数据。

**Acceptance Criteria:**

**Given** 应用首次启动
**When** 数据库初始化
**Then** Schema 自动迁移到最新版本，创建 projects 表

**Given** 数据库操作发生错误
**When** 错误被捕获
**Then** 使用类型化错误体系，IPC 返回统一 `{ success: false, error: { code, message } }` 格式

**Given** 数据目录结构需要初始化
**When** 应用首次启动
**Then** 自动创建运行时数据目录（db/projects/config/logs）

**Given** 所有数据存储
**When** 验证存储位置
**Then** 方案全文、资产、元数据 100% 存储在本地，方案内容永不上传云端（NFR9）

**Implementation Notes:**
- better-sqlite3 + Kysely + CamelCasePlugin（自动 snake_case↔camelCase，禁止手动映射）
- Kysely Migrator 启动时 `migrator.migrateToLatest()`
- BidWiseError 类型体系（禁止 throw 裸字符串）
- 统一 Response Wrapper `{ success, data, error }`

### Story 1.3: [Enabler] IPC 通信骨架与安全隔离

As a 开发者,
I want 类型化的安全 IPC 通信层,
So that 渲染进程与主进程可以安全通信，遵循一致的模式。

**Acceptance Criteria:**

**Given** IPC 通信层已建立
**When** 渲染进程发起业务请求
**Then** 请求被路由到对应 service 层处理并返回统一格式响应

**Given** 渲染进程尝试直接访问系统 API
**When** 安全隔离生效
**Then** 访问被拒绝，只能通过预定义的安全通道通信（NFR12）

**Implementation Notes:**
- 原生 ipcMain/ipcRenderer + 手动 TypeScript 类型定义（`src/shared/ipc-types.ts`）
- Handler 按 `{domain}:{action}` 频道命名（如 `project:create`）
- contextBridge 安全隔离
- Handler 薄分发层→service 层→统一 Response Wrapper

### Story 1.4: UI 框架与设计系统基础

As a 售前工程师,
I want 视觉一致、专业克制的应用界面,
So that 我可以在长时间工作中保持舒适，信息层级清晰。

**Acceptance Criteria:**

**Given** 应用启动
**When** 界面渲染
**Then** Ant Design 5.x 组件使用定制 Design Token 展示（减少边框/阴影、加大留白）（UX-DR1, UX-DR2）

**Given** 色彩系统已配置
**When** 查看界面元素
**Then** 品牌主色 `#1677FF`、语义色（成功绿/警告橙/危险红/信息蓝）、界面底色分层（全局 #FAFAFA / 内容 #FFFFFF / 侧栏 #F5F5F5）正确应用（UX-DR3）

**Given** 用户在 Windows 或 macOS 上运行
**When** 文本渲染
**Then** 正文使用系统中文字体（PingFang SC / Microsoft YaHei），代码/技术参数使用 JetBrains Mono（UX-DR4）

**Given** 间距系统已配置
**When** 布局渲染
**Then** 遵循 8px 基准网格（xs-4px / sm-8px / md-16px / lg-24px / xl-32px / 2xl-48px）（UX-DR5）

**Given** Tailwind CSS 已集成
**When** 与 Ant Design 组件共存
**Then** 无样式冲突，Tailwind 可用于定制化区域

**Given** 用户在 Windows 和 macOS 上运行
**When** 对比界面行为
**Then** 功能行为一致，快捷键 Ctrl↔Cmd 自动适配，高 DPI 用 rem+SVG 适配（NFR28, UX-DR26）

**Given** 自定义图标需求
**When** 设计系统配置
**Then** 包含批注类型图标（5 个）、SOP 阶段图标（6 个）、交叉火力图标、来源类型图标（3 个），线性风格 1.5px 线宽圆角端点（UX-DR22）

### Story 1.5: 投标项目创建与看板

As a 售前工程师,
I want 创建投标项目并在看板上纵览所有进行中的标,
So that 我可以一目了然地管理所有投标工作。

**Acceptance Criteria:**

**Given** 我在项目看板页面
**When** 点击"新建项目"
**Then** 表单出现，包含项目名称、客户名称、截止日期、方案类型（MVP：售前技术方案）字段（FR1, FR4）

**Given** 我已创建多个项目
**When** 查看看板
**Then** 所有项目以卡片形式展示：项目名 + SOP 阶段 + 截止日 + 合规状态 + 最近活动（FR2）

**Given** 项目列表存在多个项目
**When** 使用筛选栏
**Then** 可以按客户、行业、状态、截止日等维度筛选和过滤（FR7）

**Given** 多个项目同时进行
**When** 数据存储
**Then** 项目数据严格隔离（独立 SQLite 记录 + 独立项目文件目录），公司级数据跨项目共享（FR6, FR8）

**Given** 项目状态变更
**When** 编辑或归档项目
**Then** Zustand projectStore 同步更新 UI，数据通过 IPC 持久化到 SQLite

### Story 1.6: SOP 导航与阶段引导

As a 售前工程师,
I want SOP 6 阶段进度条引导我完成投标全流程,
So that 我始终知道自己在哪个阶段、下一步该做什么。

**Acceptance Criteria:**

**Given** 进入项目工作空间
**When** SOP 进度条渲染
**Then** 6 个阶段按正确状态显示：未开始（灰色空心圆）、进行中（蓝色脉冲动画）、已完成（绿色勾选）、有警告（橙色感叹号）（FR5, UX-DR8）

**Given** 某阶段状态为"未开始"
**When** 查看该阶段
**Then** 展示引导式占位符：阶段目标说明 + 开始操作入口（非空白页）（UX-DR29）

**Given** 用户点击一个未来阶段
**When** 跳转发生
**Then** 系统显示约束提示（如前置阶段未完成的警告），但仍允许导航（FR5）

**Given** 用户按下 Alt+2~6
**When** 快捷键触发
**Then** 跳转到对应 SOP 阶段（UX-DR27）

**Given** SOP 进度条渲染
**When** 查看布局
**Then** 进度条固定在顶部（48px 高度），紧凑布局不占用过多垂直空间；Beta 阶段升级为深色背景（#0C1D3A）+深色状态栏呼应，形成"上下深色包夹+中间白色内容"的混合设计方向（UX-DR28）

**Given** 产品中的弹窗/面板/通知交互
**When** 渲染
**Then** 遵循模态策略：侧边面板用于不打断主编辑流的操作，内联展开用于章节级操作，模态对话框仅用于不可逆/高风险操作，Toast 用于异步非阻塞提醒（UX-DR30）

### Story 1.7: 项目工作空间三栏布局壳子

As a 售前工程师,
I want 进入项目后看到清晰的三栏工作空间框架,
So that 后续的编辑器、批注、大纲等模块有统一的承载壳层。

**Acceptance Criteria:**

**Given** 进入项目工作空间
**When** 布局渲染
**Then** 展示三栏布局壳子：文档大纲树（左侧 240px 可折叠）+ 主内容区（弹性宽度 min 600px）+ 侧边栏（右侧 320px 可折叠）+ 状态栏（底部 32px）（UX-DR6）

**Given** 用户按 Cmd/Ctrl+B 或 Cmd/Ctrl+\
**When** 快捷键触发
**Then** 切换侧边栏或大纲树的展开/折叠（UX-DR27）

**Given** 窗口宽度 <1440px
**When** 紧凑模式触发
**Then** 大纲折叠，侧边栏折叠为图标+Badge 模式（UX-DR25）

**Given** 主内容区
**When** 布局渲染
**Then** 内容限宽 800px（阅读舒适宽度），两侧留白自然吸收；宽表格自动可横滚（UX-DR6）

### Story 1.8: 智能待办与优先级排序

As a 售前工程师,
I want 多标并行时系统自动排列优先级,
So that 我知道该先处理哪个标，不会遗漏紧急任务。

**Acceptance Criteria:**

**Given** 我有多个不同截止日和 SOP 阶段的项目
**When** 查看智能待办面板
**Then** 项目按截止日紧急度 × SOP 阶段优先级自动排序（FR3）

**Given** 我从项目 A 切换到项目 B 再切回 A
**When** 切换回项目 A
**Then** 系统自动恢复 SOP 阶段、编辑位置和待办状态（上下文零丢失）

**Given** 智能待办面板渲染
**When** 查看看板布局
**Then** 待办面板位于看板左侧（320px 宽度），显示今日关键待办并按优先级排列（UX-DR7）

### Story 1.9: 命令面板（Cmd+K）与全局快捷键

As a 售前工程师,
I want 通过 Cmd/Ctrl+K 打开命令面板快速跳转到任何功能、章节或项目,
So that 高频操作不用层层导航，键盘效率最大化。

**Acceptance Criteria:**

**Given** 用户按 Cmd/Ctrl+K
**When** 命令面板打开
**Then** 显示模糊搜索输入框，支持章节名跳转、项目切换、功能触发（导出/对抗/资产库）（UX-DR27）

**Given** 用户按 Cmd/Ctrl+S
**When** 快捷键触发
**Then** 拦截默认行为并显示"已自动保存"微提示（UX-DR27）

**Given** 用户按 Cmd/Ctrl+E
**When** 快捷键触发
**Then** 快速进入导出流程（UX-DR27）

### Story 1.10: 无障碍基础与可调显示设置

As a 售前工程师,
I want 应用满足无障碍基准要求，字号可调节,
So that 长时间使用眼睛舒适，特殊需求用户也能正常操作。

**Acceptance Criteria:**

**Given** 应用界面渲染
**When** 验证色彩对比度
**Then** 正文文本/背景对比度 ≥4.5:1，大字 ≥3:1（WCAG 2.1 AA）（UX-DR24）

**Given** 用户使用键盘导航
**When** Tab 键切换焦点
**Then** 焦点元素显示蓝色 2px outline，所有核心操作可键盘完成（UX-DR24）

**Given** 编辑器正文字号设置
**When** 用户切换字号
**Then** 支持 12/14/16px 三档切换（UX-DR24）

**Given** 系统设置了"减少动画"
**When** 检测 `prefers-reduced-motion`
**Then** 所有动效降级为静态过渡（UX-DR24）

**Given** 批注信息展示
**When** 渲染
**Then** 每种批注同时有图标+颜色+文字标签三重编码，不单靠颜色区分（UX-DR24）

## Epic 2: 招标文件分析与需求智能

售前工程师可以上传招标文件，系统自动解析出结构化需求清单、评分模型和*项高亮；可以导入客户沟通素材生成策略种子；可以通过追溯矩阵和迷雾地图深度理解招标需求。

> Story 2.1-2.2 为 Technical Enabler，交付 AI 基础设施；Story 2.3 起为用户价值 Story。

### Story 2.1: [Enabler] AI 脱敏代理层与多 Provider 适配

As a 开发者,
I want 所有 AI 调用经过统一的脱敏代理层并支持多 Provider 切换,
So that 敏感数据永不泄露到云端，且不被单一 API 供应商锁定。

**Acceptance Criteria:**

**Given** AI 调用请求发出
**When** 请求经过 ai-proxy 服务
**Then** 敏感字段（公司名/客户名/金额/技术参数）被正则规则自动替换为占位符（Alpha 阶段仅正则基线，NER 模型作为 Beta 增强）（NFR10），敏感数据泄露事件为零（NFR11）

**Given** AI 返回响应
**When** 响应经过 ai-proxy 还原
**Then** 占位符被自动还原为原始敏感内容，脱敏前后映射表本地持久化

**Given** provider-adapter 已配置
**When** 切换 Claude → OpenAI（或反向）
**Then** 业务代码无需修改，adapter 自动适配 API 格式（NFR22）

**Given** API 调用超时
**When** 超过 30 秒无响应
**Then** 自动重试最多 3 次，3 次失败后返回优雅降级错误（NFR23）

**Implementation Notes:**
- ai-proxy 服务：desensitizer.ts（正则基线，Alpha 仅正则；NER 模型 Beta 增强）+ provider-adapter.ts（Claude/OpenAI 双 Provider）
- 脱敏映射表本地持久化，返回时自动还原
- API 超时 <30s 自动重试最多 3 次（NFR23）

### Story 2.2: [Enabler] Agent 编排层与异步任务队列

As a 开发者,
I want 统一的 Agent 编排层和异步任务队列,
So that 所有 AI Agent 按一致模式调度，长时间任务不阻塞 UI。

**Acceptance Criteria:**

**Given** Agent 编排层已初始化
**When** 调用 `agentOrchestrator.execute({ agentType, context, options })`
**Then** 编排层统一处理脱敏→调用→还原→日志→重试/降级

**Given** 白名单异步操作（AI 调用/OCR/批量导入）触发
**When** 任务进入 task-queue
**Then** 任务状态持久化到 SQLite，进度通过 IPC 推送到渲染进程，支持取消/重试/断点恢复

**Given** ParseAgent 已注册
**When** 调用 `registerAgent('parse', handler)`
**Then** Agent 类型可通过 `executeAgent('parse', context)` 调用，支持 `getAgentStatus(taskId)` 查询

**Given** AI 调用完成
**When** 追溯日志
**Then** 记录调用输入（脱敏后）、输出结果、耗时、token 消耗、调用者身份

**Implementation Notes:**
- agent-orchestrator：registerAgent/executeAgent/getAgentStatus 接口
- task-queue：任务状态持久化到 SQLite，进度 IPC 推送，支持取消/重试/断点恢复
- AI 调用链日志写入 `data/logs/ai-trace/`（Alpha 积累数据，Beta 供经验图谱回溯构建）

### Story 2.3: 招标文件导入与异步解析框架

As a 售前工程师,
I want 上传招标文件后系统自动异步解析,
So that 我不用手动逐页阅读，且解析期间可以做其他事。

**Acceptance Criteria:**

**Given** 我在需求分析阶段
**When** 拖拽上传 PDF 或 Word 招标文件
**Then** 系统开始异步解析，显示进度条和预估时间（FR9, UX-DR15）

**Given** 解析正在进行
**When** 用户切换到其他项目或章节
**Then** 解析不中断，完成后通过 Toast 通知回调（NFR2）

**Given** 支持的文件格式
**When** 导入文件
**Then** 支持 PDF（含扫描件）和 Word（.docx/.doc）（NFR26）

### Story 2.4: OCR 识别与人工校正界面

As a 售前工程师,
I want 扫描件 PDF 自动 OCR 识别并支持人工校正,
So that 即使招标文件是扫描件也能准确提取内容。

**Acceptance Criteria:**

**Given** 上传的 PDF 为扫描件
**When** OCR 引擎执行识别
**Then** 中文标准印刷体识别准确率 >95%（NFR25），低置信度区域黄色高亮

**Given** OCR 识别完成且有低置信度区域
**When** 展示校正界面
**Then** 左侧原始扫描图 + 右侧识别文本对照视图，支持逐段校正或批量确认（FR10, UX-DR20）

### Story 2.5: 需求结构化抽取与评分模型

As a 售前工程师,
I want 系统从招标文件中自动抽取结构化需求清单和评分模型,
So that 我能快速把握招标核心要求和评分权重分布。

**Acceptance Criteria:**

**Given** 招标文件已完成解析
**When** LLM 结构化抽取执行
**Then** 生成技术需求条目清单，每条需求有编号、描述和来源页码（FR11）

**Given** 招标文件包含评分标准
**When** LLM 动态理解评分标准
**Then** 生成逐项可解释的评分模型（如技术方案 60 分 / 实施方案 20 分），每项有推理依据供人工确认（FR12）

**Given** 抽取结果展示
**When** 用户查看
**Then** 需求清单和评分模型以结构化表格形式展示，支持人工修正

**Given** 评分模型确认后
**When** 存储
**Then** 保存为项目级 `scoring-model.json`，后续阶段可引用

### Story 2.6: 必响应项（*项）识别与高亮

As a 售前工程师,
I want 系统自动识别招标文件中的必响应项并红色高亮,
So that 我绝不会因为遗漏*项而废标。

**Acceptance Criteria:**

**Given** 招标文件已完成解析
**When** *项检测引擎执行
**Then** 所有必响应项被自动识别并以红色高亮标注（FR13）

**Given** *项检测结果
**When** 验证准确性
**Then** 召回率 100%（零遗漏），精确率 >90%（允许少量误报）

**Given** 用户首次上传招标文件
**When** 看到*项红色高亮
**Then** 这是冷启动即时体验的第一个 Wow Moment——5 分钟内到达

**Given** *项已识别
**When** 后续方案编辑和导出
**Then** *项列表持久化，供合规三层校验引用

### Story 2.7: 策略种子生成与确认

As a 售前工程师,
I want 从客户沟通素材中提取隐性需求生成策略种子,
So that 方案能捕获招标文件之外的"灵魂"——客户真正在意的 20%。

**Acceptance Criteria:**

**Given** 我在需求分析阶段
**When** 上传客户沟通素材（会议纪要/邮件/文本记录）
**Then** 系统通过 LLM 分析并生成策略种子列表（FR14）

**Given** 策略种子已生成
**When** 查看种子卡片
**Then** 每个种子展示：种子标题 + 推理依据 + 策略建议（UX-DR17），状态为"待确认"

**Given** 用户查看种子列表
**When** 确认、调整或删除种子
**Then** 种子状态更新为"已确认"/"已调整"，确认后的种子驱动后续方案生成侧重（FR15）

**Given** 无客户沟通素材
**When** 跳过策略种子步骤
**Then** 系统提示建议获取沟通素材，策略种子区域为空但不阻塞后续阶段

**Given** 策略种子确认后
**When** 存储
**Then** 保存为项目级 `seed.json`，后续方案生成和对抗评审可引用

### Story 2.8: 需求-方案双向追溯矩阵

As a 售前工程师,
I want 招标需求与方案内容之间的双向追溯矩阵,
So that 我能确保每条需求都被方案覆盖，补遗变更时精确定位影响。

**Acceptance Criteria:**

**Given** 需求清单和方案骨架已存在
**When** 系统建立追溯矩阵
**Then** 每条招标需求映射到对应的方案章节，每个方案章节反向链接到源需求（FR16）

**Given** 招标方发布补遗/变更通知
**When** 用户导入补遗文件
**Then** 系统自动解析为新需求条目，通过追溯矩阵精确定位受影响的方案章节（FR17）

**Given** 追溯矩阵展示
**When** 用户查看
**Then** 可视化展示需求覆盖情况（已覆盖/未覆盖/部分覆盖），点击未覆盖项跳转到对应位置

### Story 2.9: 招标迷雾地图

As a 售前工程师,
I want 需求以"迷雾地图"可视化展示确定性分级,
So that 我能聚焦模糊和风险区域进行定向确认，减少方案盲区。

**Acceptance Criteria:**

**Given** 需求清单已完成结构化抽取
**When** 迷雾地图生成
**Then** 需求按确定性分为三色区域：绿色（明确）、黄色（模糊）、红色（风险）（FR18, UX-DR18）

**Given** 用户查看迷雾地图
**When** 点击模糊或风险区域的需求项
**Then** 展开详情面板，说明模糊/风险原因，引导用户进行定向确认

**Given** 用户确认了模糊需求
**When** 标记为"已确认"
**Then** 该区域从黄色变为绿色，迷雾逐步消散

## Epic 3: AI 方案生成与富文本编辑

售前工程师可以基于模板生成方案骨架，AI 逐章生成内容并标注来源，使用 Plate 富文本编辑器编辑方案，内嵌 draw.io 架构图和 Mermaid 图，来源标注和基线交叉验证确保 AI 输出可信。

### Story 3.1: Plate 富文本编辑器集成与 Markdown 序列化

As a 售前工程师,
I want 使用所见即所得的富文本编辑器编辑方案内容,
So that 我专注于内容而非 Markdown 语法，编辑体验接近最终 docx 效果。

**Acceptance Criteria:**

**Given** 进入方案编辑界面
**When** 编辑器加载
**Then** Plate/Slate 编辑器渲染方案内容为富文本，支持标题层级/列表/表格/代码块（FR24）

**Given** 用户编辑内容
**When** 内容变更
**Then** Slate AST 自动序列化为标准 Markdown 文件（proposal.md），元数据保存到 sidecar JSON（proposal.meta.json）（NFR13）

**Given** 方案正文渲染
**When** 用户阅读
**Then** 正文行高 1.8（高于常规 1.5），内容宽度限制 800px，中文排版舒适接近终稿效果（UX-DR4, UX-DR6）

**Given** 用户按键输入
**When** 字符渲染
**Then** 按键到渲染延迟 <100ms（NFR6）

**Given** 编辑过程中
**When** 内容变更
**Then** 实时自动保存到文件系统，应用崩溃后零数据丢失（NFR17）

### Story 3.2: 编辑器嵌入工作空间与文档大纲

As a 售前工程师,
I want Plate 编辑器嵌入项目工作空间主内容区，文档大纲树支持章节导航,
So that 我在三栏布局中编辑方案，大纲导航 100 页方案也能快速定位。

**Acceptance Criteria:**

**Given** 进入项目工作空间
**When** 编辑器加载
**Then** Plate 编辑器嵌入到 Story 1.7 建立的三栏布局主内容区

**Given** 方案有多个章节
**When** 查看文档大纲树
**Then** 左侧大纲树显示章节层级，点击跳转到对应位置

**Given** 状态栏渲染
**When** 查看底部
**Then** 固定底部 32px 状态栏显示合规分/质量分/字数信息（UX-DR6）

### Story 3.3: 模板反向驱动方案骨架生成

As a 售前工程师,
I want 选择模板后系统自动生成方案章节骨架,
So that 我不用从零搭建方案结构，评分权重高的章节自动标注为重点。

**Acceptance Criteria:**

**Given** 我在方案设计阶段
**When** 选择公司标准模板
**Then** 系统基于模板反向生成方案章节骨架（FR19）

**Given** 方案骨架已生成
**When** 查看章节列表
**Then** 每个章节标注对应的评分权重，高权重章节标记为"重点投入"（FR19）

**Given** 骨架已生成
**When** 用户调整大纲结构
**Then** 可以增删、重排、重命名章节，修改后的骨架持久化

### Story 3.4: AI 章节级方案生成

As a 售前工程师,
I want AI 按章节独立生成方案内容，支持补充上下文后重新生成,
So that 我可以快速获得高质量初稿，对不满意的章节精准重写。

**Acceptance Criteria:**

**Given** 方案骨架已确认
**When** 触发章节生成
**Then** AI 按章节独立生成内容，Streaming 展示生成进度（解析→匹配资产→生成内容→来源标注）（FR20, UX-DR15）

**Given** 某章节 AI 生成内容不理想
**When** 用户点击"重新生成"
**Then** 弹出引导框可补充上下文，系统基于补充信息重新生成该章节，其他章节不受影响（FR20, NFR20）

**Given** AI 生成请求
**When** API 调用失败
**Then** 自动重试最多 3 次，3 次失败后展示内联错误条：重试/手动编写/跳过三选一（NFR15, NFR23）

**Given** AI 生成单个章节
**When** 生成完成
**Then** 单章节生成时间 <2 分钟（NFR3）

**Given** AI 生成执行
**When** 所有调用通过 agent-orchestrator
**Then** 禁止绕过编排层直接调用 API，prompt 文件使用 `.prompt.ts` 规范

### Story 3.5: AI 内容来源标注与基线交叉验证

As a 售前工程师,
I want AI 生成的每段内容都标注来源，产品功能描述与基线交叉验证,
So that 我能判断"这段话是从哪来的"，防止 AI 编造技术参数。

**Acceptance Criteria:**

**Given** AI 生成方案内容
**When** 内容渲染
**Then** 每段内容旁显示 12px 来源标注标签：资产库蓝底/知识库绿底/AI 推理橙底（FR21, UX-DR16）

**Given** 内容无明确来源
**When** 渲染
**Then** 该段落以黄色高亮背景强制标注，提醒用户人工确认（FR21）

**Given** AI 生成的产品功能描述
**When** 与基础产品能力基线比对
**Then** 不匹配项自动标红，防止 AI 编造不存在的产品功能（FR22）

**Given** 用户点击来源标注标签
**When** 展开
**Then** 显示来源详情（原始出处/匹配片段/匹配度）

### Story 3.6: 文风模板与军工用语控制

As a 售前工程师,
I want AI 生成方案时自动应用军工文风模板,
So that 方案的用语规范、术语准确，像行内人写的。

**Acceptance Criteria:**

**Given** 方案生成时
**When** 文风模板已配置
**Then** AI 应用可配置的用语规范、禁用词列表、句式约束，满足军工文风要求（FR23）

**Given** 文风模板选项
**When** 用户选择
**Then** 可在军工文风/政企文风/通用文风间切换

### Story 3.7: draw.io 架构图内嵌编辑

As a 售前工程师,
I want 在编辑器中直接内嵌编辑 draw.io 架构图,
So that 不用切换工具，架构图与方案内容在同一工作台管理。

**Acceptance Criteria:**

**Given** 方案编辑过程中
**When** 插入架构图
**Then** draw.io 编辑器通过 iframe 嵌入 Electron 窗口，源文件以 .drawio 格式存储在项目 assets 目录（FR25）

**Given** draw.io 编辑器嵌入
**When** 用户编辑架构图
**Then** 编辑状态通过 postMessage 与 Slate 文档树同步

**Implementation Notes:**
- 自定义 Void Element 包裹 draw.io iframe
- iframe + postMessage 协议同步编辑状态

### Story 3.8: Mermaid 架构图草图生成

As a 售前工程师,
I want 通过 Mermaid 语法快速生成架构图草图,
So that 我可以用文字快速描述架构，系统自动渲染为可视化图表。

**Acceptance Criteria:**

**Given** 用户在编辑器中输入 Mermaid 语法块
**When** 语法渲染
**Then** 自动生成架构图草图预览（FR26）

**Given** Mermaid 图表渲染完成
**When** 用户查看
**Then** 图表可内联显示在方案中，导出时转换为图片

## Epic 4: 批注式人机协作

售前工程师可以通过批注系统与 AI 双向协作——AI 添加建议/预警/对抗反馈，用户回复指令/补充/驳回；批注按来源五色着色，可标记"待决策"并请求他人指导，跨角色通知确保协作流畅。

### Story 4.1: [Enabler] Annotation Service 基础架构与批注数据模型

As a 开发者,
I want 独立的 Annotation Service 基础架构,
So that 批注系统作为跨切面组件，编辑器/对抗引擎/评分引擎都可以发布和订阅批注。

**Acceptance Criteria:**

**Given** Annotation Service 初始化
**When** 架构组件加载
**Then** annotationStore（Zustand）管理渲染侧批注状态，批注变更通过 IPC 同步到主进程持久化（SQLite + sidecar JSON）

**Given** 应用启动
**When** Kysely 迁移执行
**Then** 自动创建 annotations 表（id, project_id, section_id, type, content, author, status, created_at, updated_at）

**Given** 批注数据模型
**When** 创建批注
**Then** 包含 id、projectId、sectionId、type（ai-suggestion/asset-recommendation/score-warning/adversarial/human/cross-role）、content、author、status（pending/accepted/rejected/needs-decision）、createdAt、updatedAt 字段

**Given** 批注变更
**When** 任何模块发布批注
**Then** 通过 store subscription 通知所有订阅者，UI 响应式更新
**And** SQLite 作为事实来源，proposal.meta.json.annotations 作为 sidecar 镜像同步

### Story 4.2: 批注卡片与五色分层着色

As a 售前工程师,
I want 批注按来源类型分层着色，一目了然知道是谁说的什么,
So that 我能快速区分 AI 建议、资产推荐、评分预警、对抗攻击和人工指导。

**Acceptance Criteria:**

**Given** 批注渲染
**When** 查看批注卡片
**Then** 五色变体正确应用：AI 建议蓝 #1677FF / 资产推荐绿 #52C41A / 评分预警橙 #FAAD14 / 对抗攻击红 #FF4D4F / 人工批注紫 #722ED1（FR28, UX-DR9）

**Given** 每种颜色的批注卡片
**When** 查看操作按钮
**Then** 蓝色：采纳/驳回/修改；绿色：插入/忽略/查看；橙色：处理/标记待决策；红色：接受并修改/反驳/请求指导；紫色：标记已处理/回复（UX-DR9）

**Given** 批注卡片操作
**When** 用户处理批注
**Then** 状态流转：待处理→已处理/已驳回/待决策

**Given** 批注导航
**When** 用户按 Alt+↑/↓
**Then** 上一条/下一条批注切换；Alt+Enter 采纳；Alt+Backspace 驳回；Alt+D 标记待决策（UX-DR27）

**Given** 批注信息传达
**When** 渲染
**Then** 每种批注同时有图标+颜色+文字标签三重编码，不单靠颜色区分（UX-DR24）

### Story 4.3: 智能批注面板与上下文优先级排序

As a 售前工程师,
I want 批注面板按上下文智能排序并提供过滤,
So that 我在当前编辑位置看到最相关的批注，不被信息洪流淹没。

**Acceptance Criteria:**

**Given** 批注面板渲染
**When** 当前在阶段 5 评审
**Then** 对抗反馈批注置顶；在阶段 4 撰写时 AI 建议和资产推荐置顶（UX-DR10）

**Given** 批注过滤器
**When** 用户操作
**Then** 5 个着色圆点按钮切换批注类型，待处理/已处理/待决策三标签切换状态（UX-DR10）

**Given** 零批注场景
**When** 某章节无批注
**Then** 显示"本章节 AI 审查完毕，未发现需要您关注的问题"（非空白）（UX-DR10）

**Given** 批注数超过 15 条
**When** 过载应急触发
**Then** 提供应急面板：[A] 逐条处理 [B] 补充上下文后重新生成 [C] 仅查看高优先级摘要（UX-DR10）

**Given** 批注面板
**When** 查看计数器
**Then** 实时显示各状态批注数量（待处理 / 已处理 / 待决策），并随当前章节视图同步更新

**Given** 用户在批注线程中想向系统提问
**When** 点击"向系统提问"入口
**Then** 输入问题后系统基于当前章节上下文给出 Streaming 风格回答，答案作为系统批注出现（UX-DR12）
**And** Alpha 阶段先不依赖产品能力基线/资产库，后续 Epic 5 再补 grounding

**Given** 批注面板与编辑器联动
**When** 用户在编辑器中切换章节（通过大纲树点击或滚动）
**Then** 批注面板自动过滤并显示当前章节关联的批注

### Story 4.4: 待决策标记与跨角色批注通知

As a 售前工程师,
I want 将批注标记为"待决策"并请求他人指导,
So that 我拿不准的问题可以请张总在批注中远程指导，不阻塞我的工作。

**Acceptance Criteria:**

**Given** 某条批注我拿不准
**When** 标记为"待决策"并指定指导人
**Then** 批注状态变为"待决策"，指定用户可在批注中回复指导（FR29）

**Given** 跨角色批注（如商务经理在成本视图的批注）
**When** 批注涉及其他用户
**Then** 系统向相关用户发送通知（FR30）

**Given** 双向人机协作
**When** 用户在批注中回复 AI（指令/补充/驳回）
**Then** AI 根据用户反馈迭代更新内容或记录决策（FR27）

## Epic 5: 资产与知识管理

售前工程师可以检索和复用历史方案片段，一键入库优质素材，维护行业术语库自动应用；管理员可以通过冷启动向导批量导入历史方案、导入能力基线、注册公司模板。

### Story 5.1: 资产库检索与标签管理

As a 售前工程师,
I want 通过标签和关键词快速检索资产库中的文字片段、架构图、表格和案例,
So that 我能快速找到可复用的历史素材，不用从零写起。

**Acceptance Criteria:**

**Given** 资产库已有内容
**When** 在搜索框输入关键词+标签（如"微服务 #架构图"）
**Then** 搜索结果以卡片列表展示：标题+摘要+标签+匹配度+来源项目，300ms 防抖（FR31）

**Given** 搜索结果
**When** 使用筛选器
**Then** 可按资产类型多选过滤：文字片段/架构图/表格/案例

**Given** 资产标签有误
**When** 用户修正标签
**Then** 标签更新持久化，后续检索按新标签索引（FR34）

**Given** 搜索无结果
**When** 显示空状态
**Then** 提示"未找到匹配资产。尝试：调整关键词 / 减少筛选条件 / 浏览全部资产"

**Given** 资产库规模达到 2000+ 片段
**When** 执行检索
**Then** 检索响应时间 <3 秒（NFR4），系统响应时间不超过正常值 2 倍（NFR29）

### Story 5.2: 资产上下文智能推荐与一键入库

As a 售前工程师,
I want 系统基于我当前编辑的章节自动推荐相关资产，优质片段一键入库,
So that 好素材不用我主动找就能送到面前，我的好方案也能沉淀为组织资产。

**Acceptance Criteria:**

**Given** 用户正在编辑某章节
**When** 资产推荐引擎分析上下文
**Then** 侧边栏被动推荐匹配的资产片段（标签+语义匹配），推荐结果以绿色批注卡片展示（FR32）

**Given** 用户选中方案中的优质片段
**When** 点击"一键入库"
**Then** 片段保存到资产库，用户可标注标签（FR33）

### Story 5.3: 行业术语库维护与自动应用

As a 售前工程师,
I want 维护行业术语对照表，AI 生成方案时自动应用术语替换,
So that 方案用语专业精准，"设备管理"自动变成"装备全寿命周期管理"。

**Acceptance Criteria:**

**Given** 术语库管理界面
**When** 添加/编辑术语对照
**Then** 创建术语映射（如"设备管理"→"装备全寿命周期管理"），持久化到公司级数据（FR35）

**Given** AI 生成方案内容
**When** 术语库已配置
**Then** 生成时自动应用术语替换，批注提示替换建议（FR35）

**Given** 术语库数据
**When** 公司级同步
**Then** 术语库通过 Git 在团队间同步共享

### Story 5.4: 历史方案批量导入引擎（冷启动）

As a 管理员,
I want 通过冷启动向导批量导入历史 Word 方案,
So that 系统从"空壳"变成"有记忆的助手"，首次使用就能推荐历史素材。

**Acceptance Criteria:**

**Given** 启动冷启动向导
**When** 选中历史方案文件夹（多份 Word 文档）
**Then** 系统异步处理：逐份解析→识别章节结构→拆分为可复用片段→自动打标签→提取 draw.io 源文件，显示进度和预估时间（FR36）

**Given** 导入完成
**When** 查看导入报告
**Then** 展示导入统计：总片段数、架构图数、技术方案段数、自动标签准确率

**Given** 自动标签有误
**When** 用户修正
**Then** 标签修正界面支持批量操作

### Story 5.5: 产品能力基线导入

As a 管理员,
I want 导入基础产品功能清单作为能力基线,
So that 后续 GAP 分析和 AI 幻觉检测有比对基准。

**Acceptance Criteria:**

**Given** 冷启动向导基线步骤
**When** 上传产品功能清单（Excel/JSON）
**Then** 系统解析为结构化功能清单，展示解析结果供确认（FR37）

**Given** 基线已导入
**When** AI 生成产品功能描述
**Then** 可与基线交叉验证（Epic 3 Story 3.5 引用）

### Story 5.6: 模板注册向导

As a 管理员,
I want 上传公司 Word 模板并确认样式映射关系,
So that docx 导出时格式 100% 符合公司模板规范。

**Acceptance Criteria:**

**Given** 冷启动向导模板步骤
**When** 上传公司标准 Word 模板
**Then** 系统自动识别样式清单，展示样式预览面板（FR38）

**Given** 样式清单已识别
**When** 用户确认映射关系
**Then** 一键生成测试文档，可在 Word 中打开验证格式正确（FR38）

**Given** 模板注册完成
**When** 存储
**Then** 模板映射配置保存为项目级 `template-mapping.json`

## Epic 6: 成本评估与 GAP 模拟

系统自动识别方案与产品基线的 GAP，按 4 号文标准估算工作量；售前工程师（共享视图）可以通过 What-if 模拟器调整功能方案、即时查看成本变化，通过批注与商务同事协作。本 Epic 交付 cost-only 模拟能力，评分影响联动在 Epic 7 Story 7.9 增量集成。无独立商务经理工作台（延迟到 V1.0+）。

### Story 6.1: GAP 自动识别与结构化清单

As a 售前工程师,
I want 系统自动对比方案需求与基础产品能力，识别 GAP 清单,
So that 我能清楚知道哪些需要定制开发，不会遗漏工作量。

**Acceptance Criteria:**

**Given** 方案需求和产品能力基线已存在
**When** GAP 分析引擎执行
**Then** 自动识别 GAP 清单，每项标注方案需求来源、基础产品差异、定制工作类型（核心定制/配置调整/新增）（FR39）

**Given** GAP 识别结果
**When** 验证准确率
**Then** GAP 识别准确率 >80%

**Given** GAP 清单
**When** 存储
**Then** 保存为项目级 `gap-analysis.json`

### Story 6.2: 4 号文成本估算

As a 售前工程师,
I want 基于 GAP 清单按 4 号文标准自动估算定制化工作量,
So that 成本估算有行业标准方法论支撑，不是拍脑袋。

**Acceptance Criteria:**

**Given** GAP 清单已生成
**When** 4 号文估算引擎执行
**Then** 按功能模块分解估算人天工作量，汇总总成本（FR40）

**Given** 估算结果
**When** 商务经理查看
**Then** 展示结构化视图：左侧 GAP 清单 + 右侧 4 号文估算 + 底部成本汇总和利润率（FR41）

### Story 6.3: What-if 成本模拟器（cost-only）

As a 售前工程师（共享视图）,
I want 通过 What-if 模拟器调整功能方案，即时看到成本变化,
So that 我能量化不同方案组合的成本影响，为报价决策提供数据支撑。

**Acceptance Criteria:**

**Given** 成本评估阶段
**When** 打开 What-if 模拟器
**Then** 左侧显示功能模块列表（可切换方案变体），右侧显示成本变化实时更新（FR42, UX-DR19）

**Given** 调整某功能模块方案
**When** 参数变更
**Then** 成本变化 <3 秒更新（NFR8）

**Given** 模拟出多个方案组合
**When** 比较
**Then** 支持多方案对比视图

> **注：** 评分影响列在 Epic 7 Story 7.8（评分仪表盘）就绪后增量集成到本模拟器，当前仅支持 cost-only 模拟。

### Story 6.4: 成本视图批注与方案联动

As a 售前工程师（共享视图）,
I want 在成本视图中通过批注与商务同事沟通调整建议,
So that 方案和报价在同一工作台联动调整，不再来回传 Excel。

**Acceptance Criteria:**

**Given** 用户在成本视图中
**When** 添加批注（如"推荐方案 B，简化运维监控"）
**Then** 批注通知到相关协作者（FR43）

**Given** 收到成本调整批注
**When** 调整对应方案章节
**Then** 成本和方案实时联动更新（FR43）

## Epic 7: 质量保障、对抗评审与合规

系统通过 LLM 动态生成多维对抗角色，执行红方攻击；交叉火力矛盾高亮为用户决策点；*项三层合规校验确保零遗漏；查重防围标；评分仪表盘实时展示预估得分和依据。

### Story 7.1: *项合规三层校验引擎

As a 售前工程师,
I want *项合规三层自动校验（解析→编辑→导出），绝不让遗漏发生,
So that 不会因为漏掉一条*项而白干一周。

**Acceptance Criteria:**

**Given** 招标文件已解析出*项列表
**When** 方案编辑过程中
**Then** 实时校验*项覆盖度，未覆盖项在状态栏显示警告（FR49 第二层）

**Given** 用户点击"导出 docx"
**When** 导出前合规检查执行
**Then** 若有*项未覆盖，弹出不可跳过的强制确认对话框，定位未覆盖项（FR49 第三层）

**Given** *项覆盖矩阵
**When** 全部覆盖
**Then** 合规矩阵逐项翻绿 + 全绿闪烁动效（UX-DR14, UX-DR23）

### Story 7.2: LLM 动态对抗角色生成

As a 售前工程师,
I want 系统根据招标文件动态生成对抗评审角色阵容,
So that 每个标都有针对性的攻击阵容，而非千篇一律的固定维度。

**Acceptance Criteria:**

**Given** 方案进入评审阶段
**When** LLM 分析招标文件+评分标准+策略种子+方案类型
**Then** 动态生成对抗角色列表，每个角色含名称、视角、攻击焦点、强度（FR45）

**Given** 对抗角色阵容
**When** 展示给用户
**Then** 用户可查看、确认、增删和调整角色后执行对抗评审（FR46）

**Given** 任何对抗阵容配置
**When** 验证
**Then** 合规审查角色始终存在，不可删除（保底机制）（FR47）

### Story 7.3: 对抗评审执行与结果展示

As a 售前工程师,
I want 一键启动多维对抗评审，结果统一排序展示,
So that 我能看到方案的所有薄弱点，逐条处理攻击意见。

**Acceptance Criteria:**

**Given** 对抗角色已确认
**When** 一键启动对抗评审
**Then** 多角色 Agent 并行攻击方案，Toast 逐个通知进度，用户等待期间可继续编辑（FR46, NFR7）

**Given** 全部 Agent 返回结果
**When** 统一展示
**Then** 批注按优先级排序展示，矛盾检测完成（非流式逐条，确保排序和矛盾检测干净）

**Given** 对抗批注
**When** 用户处理
**Then** 红色对抗批注操作：接受并修改 / 反驳（记录理由不修改）/ 请求指导（标记待决策）

### Story 7.4: 交叉火力矛盾检测与决策

As a 售前工程师,
I want 系统识别对抗角色之间的矛盾攻击并高亮为决策点,
So that "矛盾由我裁决"——这是指挥官的高光时刻。

**Acceptance Criteria:**

**Given** 多角色对抗结果返回
**When** 矛盾检测引擎分析
**Then** 识别出矛盾攻击对（如"用微服务" vs "运维太复杂"）（FR48）

**Given** 矛盾对被识别
**When** 渲染交叉火力决策卡片
**Then** ⚡矛盾标签 + 左右两条矛盾批注并排 + 中间决策输入框；动效灰→红 500ms 过渡+轻微震动+标签浮现（UX-DR11, UX-DR23）

**Given** 用户在决策输入框中输入策略决策
**When** 提交决策
**Then** AI 据决策调整方案内容，两条矛盾批注同时关闭，卡片变为绿色边框+执行结果摘要（UX-DR11）

### Story 7.5: "先评后写"攻击清单

As a 售前工程师,
I want 在正式撰写方案前先看到对抗攻击清单,
So that 我在写的时候就进行防御性写作，而非写完再被打回。

**Acceptance Criteria:**

**Given** 方案进入撰写阶段前
**When** 先评后写功能触发
**Then** 对抗 Agent 基于招标文件和策略种子生成"攻击清单"，供撰写时参考（FR44）

**Given** 攻击清单已生成
**When** 用户进入方案撰写
**Then** 攻击清单以侧边面板展示，可逐条查看并在撰写时主动防御

### Story 7.6: 方案相似度检测（防围标）

As a 售前工程师,
I want 系统检测方案相似度防止围标风险,
So that 多标并行时不会因为方案雷同而触犯法律红线。

**Acceptance Criteria:**

**Given** 多个方案已完成
**When** 相似度检测执行
**Then** 对比当前方案与其他方案的相似度，标出高相似段落（FR50）

**Given** 疑似高相似段落
**When** 检测结果展示
**Then** 并排展示相似段落对比，提供修改建议

### Story 7.7: 模板规范校验

As a 售前工程师,
I want 系统自动校验方案是否符合公司模板规范,
So that 字体、页眉、页码、Logo 等格式问题在导出前被捕获。

**Acceptance Criteria:**

**Given** 方案准备导出
**When** 模板规范校验执行
**Then** 检查字体/页眉/页码/Logo 是否符合公司模板（FR51），不符合项以列表形式展示

### Story 7.8: 实时评分仪表盘

As a 售前工程师,
I want 实时评分仪表盘展示预估各评分项得分和依据,
So that 我知道方案目前能拿多少分，哪些分项还有提升空间。

**Acceptance Criteria:**

**Given** 评分模型已建立
**When** 方案内容变更
**Then** 状态栏形态：合规分实时跳动（本地规则引擎秒级更新）+ 质量分手动刷新（LLM 分钟级评估）（FR52, UX-DR13）

**Given** 用户展开评分面板
**When** 查看面板形态
**Then** 展示逐项评分明细 + 每项推理依据（对应方案内容位置+评分标准条款）+ 趋势图（FR52, UX-DR13）

**Given** 分数变化
**When** 上升或下降
**Then** 数字滚动动画 + 上升绿色发光 / 下降红色发光（UX-DR23）

**Given** 分数颜色映射
**When** 渲染
**Then** 绿色 >80 / 橙色 60-80 / 红色 <60（UX-DR13）

### Story 7.9: What-if 模拟器评分影响集成

As a 售前工程师,
I want What-if 模拟器在调整功能方案时同时显示评分影响预估,
So that 我能量化"砍这个功能省 30 万，评分掉 5 分，值不值？"（FR42 完整交付）。

**Acceptance Criteria:**

**Given** Epic 7 Story 7.8 评分仪表盘已就绪
**When** 用户在 What-if 模拟器中调整功能模块方案
**Then** 右侧同时显示成本变化 + 评分影响预估实时联动（FR42 完整覆盖）

**Given** 评分影响计算
**When** 参数变更
**Then** 成本变化 + 评分影响 <3 秒更新（NFR8）

**Given** 评分引擎临时不可用
**When** 降级模式
**Then** 模拟器仍显示成本变化（回退到 Story 6.3 的 cost-only 能力），评分列标注"暂不可用"

> **依赖：** 本 Story 依赖 Story 7.8（评分仪表盘）提供评分计算能力，依赖 Story 6.3（What-if cost-only）提供模拟器 UI 基础。

## Epic 8: 文档导出与交付

售前工程师可以预览方案最终效果，一键导出精确模板化 docx，draw.io 图自动转 PNG 高清插入，图表自动编号，格式问题提供降级方案确保截止日前一定能产出。

### Story 8.1: [Enabler] python-docx 渲染引擎与进程通信

As a 开发者,
I want python-docx 渲染引擎作为独立进程运行,
So that docx 渲染可独立于 Electron 主应用开发、测试和升级。

**Acceptance Criteria:**

**Given** 应用启动
**When** 渲染引擎进程启动
**Then** 进程就绪后主进程可发送渲染请求

**Given** 渲染引擎运行中
**When** 健康检查失败
**Then** 自动重启渲染进程

**Given** 渲染引擎需要更新
**When** 独立升级
**Then** 可独立于 Electron 主应用版本升级（NFR27）

**Implementation Notes:**
- FastAPI over localhost HTTP（随机端口，启动时协商）
- Python 进程绑定端口后 stdout 输出 `READY:{port}`
- 健康检查：每 30 秒 GET `/api/health`，3 次连续失败自动重启
- 统一 `{ success, data, error }` 响应格式

### Story 8.2: 导出前预览

As a 售前工程师,
I want 在导出前预览方案的最终 docx 效果,
So that 我可以确认格式无误再导出，消除"导出后格式会不会乱"的焦虑。

**Acceptance Criteria:**

**Given** 方案准备导出
**When** 点击预览
**Then** 展示方案最终 docx 效果的预览视图，排版接近真实导出结果（FR53）

**Given** 预览中发现问题
**When** 用户调整
**Then** 可返回编辑器修改后重新预览

### Story 8.3: 一键 docx 导出与模板样式映射

As a 售前工程师,
I want 一键将方案从编辑态导出为精确模板化的 docx 文档,
So that 输出的 Word 文档样式 100% 合规，不需要手动调格式。

**Acceptance Criteria:**

**Given** 预览确认无误
**When** 点击"导出 docx"
**Then** 渲染引擎基于模板映射配置精确映射核心样式（标题/正文/表格/图片/目录），生成 docx 文件（FR54）（高级排版如续表表头/多节页眉留待后续迭代）

**Given** 100 页方案
**When** 导出执行
**Then** 导出时间 <30 秒（NFR5）

**Given** 导出结果
**When** 在 Word 中打开
**Then** 图片不丢、格式不乱、编号正确、样式精确映射（NFR16）

**Given** 目录结构
**When** 导出
**Then** 目录自动生成，页码正确

### Story 8.4: draw.io 自动转 PNG 与图表编号

As a 售前工程师,
I want 导出时 draw.io 架构图自动转换为高清 PNG，图表自动编号,
So that 导出的 Word 中架构图清晰、编号规范，无需手动处理。

**Acceptance Criteria:**

**Given** 方案中内嵌 draw.io 架构图
**When** docx 导出执行
**Then** .drawio 源文件自动转换为高清 PNG 插入 docx（FR55）

**Given** 方案中有多个图表
**When** 导出
**Then** 按章节位置自动分配图表编号，交叉引用自动替换（FR56）

### Story 8.5: 格式降级方案与合规报告

As a 售前工程师,
I want 格式问题时提供降级方案而非导出失败,
So that 截止日前我一定能产出可用的文档，即使有小瑕疵。

**Acceptance Criteria:**

**Given** 导出检测到格式问题
**When** 问题展示
**Then** 格式问题清单面板逐项列出：问题描述+定位按钮+修复指南（FR57, UX-DR21）

**Given** 用户选择降级导出
**When** 导出执行
**Then** docx 中格式问题位置插入黄色高亮批注标注提醒人工修复（FR57, NFR21）

**Given** 导出完成
**When** 合规报告生成
**Then** 随方案导出合规性验证报告，包含*项覆盖情况和评分预估（FR58）

## Epic 9: 系统管理与部署运维

IT 管理员可以通过静默安装脚本批量部署，配置 AI 代理层和脱敏策略，通过 Git 同步公司级数据，一键推送版本更新并支持自动回滚，API Key 过期提前告警，数据自动备份。

### Story 9.1: 静默安装与批量部署

As a 管理员权限用户,
I want 通过静默安装脚本在全公司电脑上批量部署 BidWise,
So that 30 台电脑 2 小时内全部部署完毕，无需逐台手动安装。

**Acceptance Criteria:**

**Given** Electron 安装包已准备（Win/Mac 各一个）
**When** 执行静默安装脚本
**Then** 自动完成安装 + 预置 AI 配置 + Git 仓库地址，无需用户交互（FR59）

**Given** 安装完成
**When** 首次启动
**Then** 所有数据存在本地，无需服务器/数据库外部依赖

### Story 9.2: 管理员初始化向导（AI 配置+脱敏策略）

As a 管理员权限用户,
I want 通过初始化向导配置 AI 代理层和脱敏策略,
So that API Key 安全存储，敏感字段自动脱敏后再调用 AI。

**Acceptance Criteria:**

**Given** 管理员首次启动
**When** 进入初始化向导
**Then** 第一步输入 API Key，系统自动验证连通性（FR60）

**Given** API Key 验证通过
**When** 配置脱敏策略
**Then** 展示脱敏规则（公司名/客户名/金额等），管理员可自定义规则和白名单（FR60）

**Given** API Key
**When** 存储
**Then** 本地 AES-256 加密，加密密钥派生自机器标识，Git 同步时排除在 .gitignore 中

### Story 9.3: Git-based 公司级数据同步

As a 管理员权限用户,
I want 公司级数据通过内部 Git 仓库自动同步,
So that 资产库、模板库、术语库在团队间共享，天然支持版本管理。

**Acceptance Criteria:**

**Given** Git 仓库已配置
**When** 数据同步触发
**Then** 资产库/模板库/术语库通过内部 GitLab 同步，用户界面显示"自动同步"（FR61）

**Given** 同步遇到冲突
**When** 冲突检测
**Then** 自动合并成功率 >95%（NFR24），冲突通过可视化界面解决（完全隐藏 Git 概念，展示为"版本选择"）

**Given** 同步通信
**When** 数据传输
**Then** 仅通过内部网络，不经过公网（NFR14）

### Story 9.4: 版本更新推送与静默升级

As a 管理员权限用户,
I want 一键推送版本更新，客户端空闲时静默升级,
So that 30 台电脑零干扰完成升级，用户第二天打开就是新版本。

**Acceptance Criteria:**

**Given** 新版本可用
**When** 管理员面板显示
**Then** 展示"新版本可用"+ 更新说明，一键推送（FR62）

**Given** 更新推送后
**When** 客户端空闲时段
**Then** 静默执行更新，无需用户交互（FR62）

### Story 9.5: 更新自动校验与回滚

As a 管理员权限用户,
I want 更新后自动校验核心功能，校验失败自动回滚,
So that 投标截止日前不会因升级导致系统不可用。

**Acceptance Criteria:**

**Given** 更新完成后首次启动
**When** 自动校验核心功能
**Then** 校验通过则正常运行，校验失败自动回滚到上一版本并通知管理员（FR63, NFR18）

**Given** 回滚机制
**When** 需要回滚
**Then** 保留上一版本安装包，回滚过程自动完成

### Story 9.6: API Key 过期告警

As a 管理员权限用户,
I want AI API Key 即将过期时提前 7 天告警,
So that 及时更换 Key，避免 AI 功能中断影响投标工作。

**Acceptance Criteria:**

**Given** API Key 有效期
**When** 距过期 ≤7 天
**Then** 管理员面板弹出告警："API Key 将于 X 天后过期，请及时更换以避免 AI 功能中断"（FR64）

**Given** 管理员更新 Key
**When** 通过 Git 同步
**Then** 新 Key 推送到全团队（加密传输）

### Story 9.7: 本地数据自动备份

As a 管理员权限用户,
I want 系统自动定时备份数据到指定路径,
So that 数据不会因硬件故障或误操作丢失。

**Acceptance Criteria:**

**Given** 管理员配置了备份路径和频率
**When** 定时任务触发
**Then** 自动备份 SQLite 数据库 + 项目文件到配置路径（FR65, NFR19）

**Given** 备份频率
**When** 默认设置
**Then** 每日自动备份，频率可配置

**Given** 备份执行
**When** 用户使用系统
**Then** 备份过程用户无感知

## Epic 10: 经验沉淀飞轮

系统从每次人机协作中自动学习——用户的修正、驳回、决策经验沉淀为时序知识图谱，AI 生成和评审时自动查询历史经验防止重复犯错，越用越聪明。

### Story 10.1: [Enabler] 经验知识图谱基础设施（Graphiti + Kuzu）

As a 开发者,
I want 基于 Graphiti + Kuzu 的本地经验知识图谱引擎,
So that 人机协作中的决策经验可以被结构化存储、时序追溯和语义检索。

**Acceptance Criteria:**

**Given** Python 进程启动
**When** graphiti-engine 初始化
**Then** Kuzu 嵌入式图数据库加载，Graphiti（graphiti-core）引擎就绪，FastAPI 路由可用（FR67）

**Given** 经验数据模型定义
**When** 创建经验节点
**Then** 包含实体（术语/章节类型/客户/行业）、关系（修正/偏好/教训）、时间窗口（生效时间/失效时间）、置信度（被采纳次数越多越高）

**Given** 检索请求
**When** 查询相关经验
**Then** 混合语义+BM25+图遍历检索，P95 延迟 <300ms，检索阶段无需 LLM 调用

**Given** 经验图谱构建需要 LLM
**When** 从非结构化数据提取实体/关系
**Then** 所有 LLM 调用经过脱敏代理层（ai-proxy），遵循 agent-orchestrator 统一模式

**Given** Alpha 阶段积累的 AI 调用日志和用户修改 diff
**When** Beta 阶段 graphiti-engine 首次初始化
**Then** 可回溯性地从历史数据构建初始经验图谱

### Story 10.2: 经验自动捕获

As a 售前工程师,
I want 我的每次修正、决策和教训被系统自动沉淀为组织经验,
So that 团队不会重复犯同样的错误，新人也能继承老手的判断。

**Acceptance Criteria:**

**Given** 用户修改了 AI 生成的内容
**When** diff 检测到有意义的修改（非格式微调）
**Then** 提示"是否记录为经验？"一键确认或跳过（低摩擦），确认后自动提取修改前后内容+原因+章节类型+行业标签存入图谱（FR66）

**Given** 用户在交叉火力中做出决策
**When** 决策提交
**Then** 决策自动记录为经验（决策即经验，无需额外操作）：矛盾双方+用户决策+决策理由+项目上下文（FR66）

**Given** 用户驳回 AI 批注
**When** 驳回操作
**Then** 可选填驳回原因（非强制），填写的原因作为经验存入图谱（FR66）

**Given** 经验已捕获
**When** 存储
**Then** 经验自动打标签（行业/客户/章节类型/项目类型），公司级经验通过 Git 同步在团队间共享

### Story 10.3: AI 生成时经验注入与防重复犯错

As a 售前工程师,
I want AI 生成方案和评审时自动参考历史经验,
So that "上次在类似项目中被驳回的写法"不会再出现。

**Acceptance Criteria:**

**Given** AI 生成章节内容
**When** agent-orchestrator 执行前
**Then** 自动查询经验图谱获取相关经验（当前章节类型+行业+客户+相似项目的历史修正），注入到 prompt 的"历史经验参考"区块（FR68）

**Given** 生成的内容命中历史"被驳回"模式
**When** 匹配检测
**Then** 自动附加橙色预警批注："类似内容在[项目 X]中被驳回，原因是[Y]"（FR69）

**Given** 对抗评审执行前
**When** Agent 查询经验
**Then** 对抗 Agent 可引用历史决策："在[类似项目]中用户选择了[Z 方案]来解决类似矛盾"（FR68）

**Given** 经验图谱不可用或无相关经验
**When** AI 生成执行
**Then** 正常生成不受影响（经验注入为增强层非必须层，降级为无经验的基线生成）

### Story 10.4: 方案变更日志与经验追溯

As a 售前工程师,
I want 查看方案内容的完整变更历史,
So that 我能回溯"这段话为什么变成现在这样"的演变链，为复盘和经验校准提供数据。

**Acceptance Criteria:**

**Given** 方案内容每次变更（AI 生成/用户修改/批注采纳）
**When** 变更发生
**Then** 自动记录变更日志：section + 变更前内容 + 变更后内容 + 变更原因 + 变更者（AI/用户）+ 时间戳

**Given** 变更日志已积累
**When** 用户查看某段落的历史
**Then** 展示完整的演变链，每步有变更理由

**Given** 变更日志数据
**When** 持久化
**Then** 存储在 sidecar JSON（proposal.meta.json）的 changelog 字段中，为 V1.0 AAR 复盘提供数据基础
