# 预售技术方案生成系统设计文档

## 1. 背景与目标

- **业务痛点**：工业软件公司在招标阶段需要快速、精准地编写技术方案，且必须满足公司统一的 Word 模板（字体、格式、页眉页脚等）以及包含大量文字、图片、表格等资产的复用需求。
- **目标**：构建一个 **多智能体（Multi‑Agent）+ ReACT 循环** 的系统，能够：
  1. 自动生成方案草稿；
  2. 通过多角色评审（甲方、评标专家、内部 PM/研发/测试等）进行多轮博弈；
  3. 在冲突无法自行解决时触发 **Human‑in‑the‑Loop 仲裁**；
  4. 将 Markdown 内容渲染为符合公司标准的 Word 文档；
  5. 支持图片、表格、架构图等资产的快速复用。

---

## 2. 系统整体架构

```
+-------------------+      +-------------------+      +-------------------+
|   招标文件输入    | ---> |   RAG + 向量化    | ---> |   主编 Agent      |
+-------------------+      +-------------------+      +-------------------+
                                 |                     |
                                 v                     v
                      +-------------------+   +-------------------+
                      |   资产库 (Asset  |   |   DebateManager   |
                      |   Meta‑Library)  |   |   (多轮博弈)      |
                      +-------------------+   +-------------------+
                                 |                     |
                                 v                     v
                      +-------------------+   +-------------------+
                      |   评审 Agents    |   |   人类仲裁 UI    |
                      | (甲方、专家、PM…) |   | (仲裁面板)        |
                      +-------------------+   +-------------------+
                                 |                     |
                                 v                     v
                      +-------------------+   +-------------------+
                      |   ReACT 循环      |   |   渲染层 (Pandoc) |
                      +-------------------+   +-------------------+
                                 |                     |
                                 v                     v
                      +-------------------------------------------+
                      |   最终 Word 文档 (company_template.docx) |
                      +-------------------------------------------+
```

### 2.1 关键组件说明

| 组件 | 作用 | 与 MiroFish 的对应点 |
|------|------|----------------------|
| **RAG + 向量化** | 将招标 PDF/Word 转为向量，抽取关键需求 | 与 MiroFish 中的 `trace_graph`、[search](file:///Volumes/Data/Work/Code/LLM/MiroFish/backend/app/services/zep_tools.py#464-545) 类似 |
| **主编 Agent** | 根据需求大纲生成 Markdown 初稿 | 对应 MiroFish 的 [ReportAgent](file:///Volumes/Data/Work/Code/LLM/MiroFish/backend/app/services/report_agent.py#864-1881) / `PlanAgent` |
| **评审 Agents** | 多角色（甲方、评标专家、内部 PM、研发等）分别给出评审意见 | 与 MiroFish 的多 Persona ([OasisProfileGenerator](file:///Volumes/Data/Work/Code/LLM/MiroFish/backend/app/services/oasis_profile_generator.py#142-1200)) |
| **DebateManager** | 实现 **Round‑Robin** 多轮博弈：找茬 → 辩护 → 妥协 → 仲裁 | 采用 MiroFish 的 **ReACT** 循环思考‑行动‑观察模式 |
| **Human‑in‑the‑Loop UI** | 当冲突无法自行解决时弹出仲裁面板，供人类输入指令 | 与 MiroFish 中的 **手动干预** 机制相似，但更结构化 |
| **资产库 (Asset Meta‑Library)** | 存放图片、表格、架构图等资产，带丰富标签与 Markdown 片段 | 与 MiroFish 的 **Zep 知识图谱** 类似，只是专注于多媒体资产 |
| **渲染层** | 使用 `pandoc --reference-doc=company_template.docx` 将 Markdown → Word，保持公司模板样式 | 与 MiroFish 的 **Report Generation** 类似，只是输出格式不同 |

---

## 3. 多轮博弈实现细节

### 3.1 轮次设计
1. **Round 1 – 找茬阶段**
   - 主编 Agent 输出方案 V1.0（Markdown）。
   - 所有评审 Agents 并发读取，返回 **评审意见**（JSON：[section](file:///Volumes/Data/Work/Code/LLM/MiroFish/backend/app/services/report_agent.py#2093-2129), `suggestion`, `severity`）。
2. **Round 2 – 辩护/反驳阶段**
   - 主编 Agent 对每条意见进行 **接受**、**驳回** 或 **部分采纳**，并在返回的 **变更日志** 中记录原因。
   - 采用 **Stubbornness Score**（0‑1）控制每个 Agent 的坚持程度。
3. **Round 3 – 妥协阶段**
   - 评审 Agents 收到主编的驳回理由后再次评估，若仍坚持则返回 **`request_arbitration`**。
   - 若多数 Agent 已达成一致，则进入 **方案完善**；否则进入 **仲裁**。

### 3.2 结构化 Prompt 示例（主编 Agent）
```text
You are the ProposalEditor Agent.
Your task: incorporate the following reviewer feedback into the current proposal.
---
Current proposal (Markdown) ...
---
Feedback JSON:
[
  {"section":"系统架构", "suggestion":"增加数据库审计模块", "severity": "high"},
  {"section":"实施计划", "suggestion":"工期不能超过 3 个月", "severity": "critical"}
]
---
Produce:
1. A **modifications** list (section, change, reason).
2. A **rejections** list (reviewer, suggestion, reason).
3. Updated Markdown proposal.
```

### 3.3 仲裁机制
- 当 `request_arbitration` 出现时，系统状态切换为 `PENDING_HUMAN_ARBITRATION`。
- 前端弹出 **仲裁面板**，展示冲突双方的理由与可选方案（A/B/自定义）。
- 人类输入指令后，系统将指令包装为 **System Override**，注入下一轮 ReACT 循环，强制执行。

---

## 4. 渲染层与样式一致性

### 4.1 使用 Pandoc + Reference‑Doc
1. **准备公司模板**：`company_template.docx`（包含所有公司标准的样式、页眉页脚、Logo、目录字段）。
2. **转换命令**：
   ```bash
   pandoc proposal.md -o proposal.docx \
          --reference-doc=company_template.docx \
          --metadata=title:"技术方案" \
          --toc
   ```
3. **效果**：Markdown 的 `#`、`##` 自动映射到模板中的 “标题1/标题2”，段落、列表、代码块均使用模板的正文样式，图片、表格保持原始尺寸并套用模板的表格样式。

### 4.2 若需更细粒度控制（python-docx）
- 将 Markdown 转为 **JSON AST**（使用 `mistune` 或 `markdown-it-py`），在脚本中遍历节点并使用 `python-docx` 按 **书签**（Bookmark）插入内容，确保每一页的布局、页眉页脚、页码完全符合公司规范。

---

## 5. 资产库（Asset Meta‑Library）

### 5.1 资产结构示例（JSON）
```json
{
  "asset_id": "img_arch_microservice_v3",
  "type": "image",
  "url": "/assets/arch/microservice_v3.png",
  "caption": "基于 Spring Cloud 的微服务高可用架构图",
  "tags": ["微服务", "架构图", "高可用", "Spring Cloud"],
  "applicable_scenarios": ["大并发", "政务内网", "信创要求"],
  "markdown_snippet": "![微服务架构图](/assets/arch/microservice_v3.png)\n*图 X‑Y：基于 Spring Cloud 的微服务高可用架构图*"
}
```

### 5.2 检索与注入流程
1. **Agent Thought**："本章节需要系统架构图"。
2. **Action**：调用 `search_visual_assets(query="系统架构", tags=["微服务", "高可用"])`。
3. **Observation**：返回上述 JSON（含 `markdown_snippet`）。
4. **Agent**：在生成章节时直接把 `markdown_snippet` 插入，随后继续撰写文字说明。

### 5.3 表格复用
- 将常用的功能清单、硬件配置表等保存为 **CSV/JSON**，在需要时 **按需过滤**（如只保留满足招标要求的行），再渲染为 Markdown 表格，Pandoc 会自动转为 Word 中的正式表格（带边框、底纹）。

---

## 6. 与 MiroFish 可借鉴的技术点

| MiroFish 功能 | 在本系统的对应实现 | 价值说明 |
|---------------|-------------------|----------|
| **Zep 知识图谱** | **资产库 + 向量化 RAG** | 为方案生成提供结构化的背景知识与可复用资产 |
| **多 Persona（OasisProfileGenerator）** | **评审 Agents（甲方、专家、PM、研发）** | 多视角评审保证方案全方位覆盖 |
| **ReACT 循环（思考‑行动‑观察）** | **DebateManager + ReACT** | 让 Agent 在每轮评审后主动查询、修正、重新生成，避免一次性生成错误 |
| **冲突检测 & 人工干预** | **仲裁 UI + System Override** | 当自动协商失败时，及时让人类介入，防止死循环 |
| **报告生成（ReportAgent）** | **渲染层（Pandoc + Template）** | 将结构化 Markdown 直接输出符合公司标准的 Word 文档 |
| **系统日志 & 变更记录** | **变更日志 JSON** | 全程可追溯，后期审计、经验沉淀方便 |

---

## 7. 工作流示例（端到端）
1. **上传招标文件** → 系统进行 OCR → 向量化 → 关键需求抽取。
2. **主编 Agent** 根据需求大纲生成 `proposal_v1.md`（包含占位的资产标签）。
3. **评审 Agents** 并发给出 `feedback.json`。
4. **DebateManager** 触发 ReACT 循环，主编 Agent 根据反馈迭代生成 `proposal_v2.md`，并记录 `modifications` 与 `rejections`。
5. 若出现 `request_arbitration`，弹出仲裁面板，用户选择或自定义指令。
6. **渲染层** 使用 Pandoc + `company_template.docx` 将最终 Markdown 转为 `Technical_Proposal.docx`。
7. **交付**：生成的 Word 文档直接满足投标要求，且附带 **评审记录**（PDF）供内部审计。

---

## 8. 下一步行动建议
- **需求确认**：与业务方确认需要的评审角色、仲裁触发阈值。
- **资产库建设**：先把已有的架构图、产品手册、标准表格导入并打标签。
- **模板准备**：导出公司标准的 `company_template.docx`（确保所有样式已定义）。
- **原型实现**：
  1. 搭建 RAG 流程（招标文件 → 向量 → 关键需求）。
  2. 实现主编 Agent（基于 OpenAI / Claude）。
  3. 实现一个简化的评审 Agent（两三个角色），验证 ReACT 循环。
  4. 集成 Pandoc 渲染。
- **评审与迭代**：内部跑一次完整流程，收集反馈后逐步加入更多角色、仲裁 UI 与资产检索。

---

**本文档即为完整的点子过程与可落地实现方案。** 如需进一步拆分为 PRD、功能清单或原型代码，请随时告知，我可以继续帮助细化。
