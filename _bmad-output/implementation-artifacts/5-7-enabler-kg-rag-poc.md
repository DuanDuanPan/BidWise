# Story 5.7 [Enabler]: 知识图谱与 RAG POC 验证

Status: ready-for-dev

<!-- Note: This is a POC enabler story. Goal is go/no-go validation, not production code. -->
<!-- Outcome gates the production implementation in 5-8 ~ 5-12. -->

## Story

As a 技术架构负责人,
I want 通过 POC 验证 markitdown + 本地 embedding + 投标域实体抽取 + sqlite-vec 在真实标书样本上的可行性与效果,
So that 在投入 5-8 ~ 5-12 生产实现前确认技术路线,避免方向性返工。

## Background

讨论结论(2026-04-17):
- 砍掉 graphify(架构耦合 Claude Code,不可换 LLM provider,无中文支持)
- 砍掉 Graphiti / Neo4j(桌面一键装不可行)
- 砍掉 LightRAG(默认开箱强,但多文件存储 + 上游 churn 风险,留作 Beta 备选)
- 选定:**自研** sqlite-vec + 本地 BGE + 投标域 prompt + 7 个图查询 tool
- POC 必须先验证三件事:markitdown 中文标书还原率、本地 LLM 投标域实体抽取质量、sqlite-vec 性能

## Acceptance Criteria

1. **AC1 — markitdown 还原率量化**
   Given 5 份真实投标 docx 样本(含合并表、嵌套表、图文混排、章节编号、目录)
   When 通过 markitdown 转 markdown
   Then 输出量化报告,覆盖:章节结构保留率、表格保留率(分简单/合并/嵌套)、图片提取率、公式保留率、编号还原率;每类报告"完美/降级/丢失"三档计数

2. **AC2 — 复杂表插入路径决策**
   Given AC1 报告中识别出 markdown 表达不了的表格类型
   When 分析三种方案 (HTML-in-markdown / 自定义 Plate 块 + OOXML / 图片降级)
   Then 给出每种类型的归属决策表,并实现一个 Plate 反序列化样例(remark + rehype + plate-html)证明 HTML 表可正确渲染合并单元格

3. **AC3 — 本地 LLM 投标域实体抽取**
   Given 一份样本标书 markdown(含甲方/乙方/资质/规范号/技术指标/强制项)
   When 通过本地 LLM(Qwen2.5-7B/14B 或 Llama-3-8B-Chinese,via Ollama)+ 自定义 prompt 抽取
   Then 人工标注 ground truth,计算 precision / recall / F1;F1 ≥ 0.7 视为可用,< 0.5 视为不可用需换模型;同时跑云 Claude(脱敏后)对比作为上限基线

4. **AC4 — sqlite-vec 性能基线**
   Given 模拟 1K / 10K / 50K chunks 三档规模,每 chunk 512 维 BGE-zh embedding
   When 执行 top-K (K=10) cosine 检索
   Then 量化 P50 / P99 延迟,并验证 better-sqlite3 加载 sqlite-vec 扩展在 macOS / Windows / Linux 三平台无报错;延迟 P99 < 200ms 视为通过

5. **AC5 — 混合检索质量对照**
   Given 一份测试集(20 个 query → 已知相关 chunks)
   When 跑三种检索:纯 BM25 / 纯 cosine / RRF 融合
   Then 计算 Recall@10、MRR;融合方案应优于任一单一方案;输出对比表

6. **AC6 — 包体 / 部署评估**
   Given 选定的 BGE-zh 模型(onnx 量化版)+ sqlite-vec 扩展 + Python sidecar 依赖
   When 通过 electron-builder 打包测试
   Then 量化包体增量(MB)、首次启动时延、内存占用;目标:增量 < 300MB、模型加载 < 5s、推理常驻 < 800MB

7. **AC7 — Go/No-Go 报告**
   Given AC1 ~ AC6 全部完成
   When 撰写 POC 总结报告
   Then 报告必须含:每项 AC 的量化数据、风险清单、与 LightRAG 备选方案的对比矩阵、明确 Go/No-Go 决策与理由;若 Go,给出 5-8 ~ 5-12 排期建议

## Tasks / Subtasks

### Task 1: 样本采集与 markitdown 评估 (AC: #1, #2)

- [ ] 1.1 采集 5 份真实投标 docx 样本(覆盖政府类/企业类/技术类/混合类),保存到 `_bmad-output/poc-artifacts/kg-rag/samples/`
- [ ] 1.2 Python 脚本 `scripts/poc/markitdown-eval.py`:批量转 markdown,输出每份的元数据(章节数/表数/图数/公式数)
- [ ] 1.3 人工标注 ground truth(原 docx 章节/表/图清单),与 markitdown 输出 diff
- [ ] 1.4 生成量化报告 `_bmad-output/poc-artifacts/kg-rag/markitdown-report.md`
- [ ] 1.5 复杂表归类:统计需 HTML 嵌入的占比、需自定义块的占比、需图片降级的占比
- [ ] 1.6 Plate HTML 表反序列化样例 spike:`apps/poc/plate-html-table-spike/`,证明合并单元格可往返

### Task 2: 本地 LLM 投标域实体抽取 (AC: #3)

- [ ] 2.1 安装 Ollama,拉取 Qwen2.5-7B / Qwen2.5-14B / Llama-3-8B-Chinese 三个候选
- [ ] 2.2 撰写投标域抽取 prompt(实体类型:甲方/乙方/资质/规范号/技术指标/产品/人/组织;关系类型:拥有/适用于/由...提供/冲突/继承)
- [ ] 2.3 选 1 份样本,人工标注 ground truth(实体列表 + 关系列表),保存 `samples/sample-1-gt.json`
- [ ] 2.4 三个本地模型 + 云 Claude(脱敏后)各跑一遍,记录输出
- [ ] 2.5 计算 precision / recall / F1,生成对比表
- [ ] 2.6 决策:选定本地模型;若 F1 < 0.5,扩展 prompt 或换更大模型重测

### Task 3: sqlite-vec + BGE 性能基线 (AC: #4, #6)

- [ ] 3.1 spike `apps/poc/sqlite-vec-spike/`:better-sqlite3 加载 sqlite-vec,跑通插入 + 检索
- [ ] 3.2 三平台编译验证(macOS arm64 / Windows x64 / Linux x64)
- [ ] 3.3 BGE-zh / bge-m3 onnx 量化版下载,Python `onnxruntime` 推理 spike
- [ ] 3.4 模拟数据生成器(1K / 10K / 50K chunks,各 512 维向量)
- [ ] 3.5 性能压测:top-K 检索 P50/P99,记录到 `_bmad-output/poc-artifacts/kg-rag/perf-report.md`
- [ ] 3.6 electron-builder 打包测试:量化包体增量、启动时延、内存占用

### Task 4: 混合检索质量对照 (AC: #5)

- [ ] 4.1 构建测试集:20 个真实 query → 人工标注相关 chunks(从 Task 1 产出的 markdown 抽样)
- [ ] 4.2 实现三种检索:纯 BM25 (现有 FTS5)、纯 cosine (sqlite-vec)、RRF 融合
- [ ] 4.3 计算 Recall@10 / MRR,生成对比表
- [ ] 4.4 探究加权策略(实体重叠加权、heading_path 加权)对融合效果的提升

### Task 5: Go/No-Go 报告 (AC: #7)

- [ ] 5.1 汇总 AC1 ~ AC6 数据,撰写 `_bmad-output/poc-artifacts/kg-rag/go-no-go-report.md`
- [ ] 5.2 与 LightRAG 备选做对比矩阵(部署/维护/质量/扩展性)
- [ ] 5.3 明确 Go/No-Go,若 Go 给出 5-8 ~ 5-12 排期与人力估算
- [ ] 5.4 报告评审通过后,更新 sprint-status.yaml 中 5-8 ~ 5-12 状态

## Dev Notes

### 技术栈对齐
- Python sidecar 已存在(docx 渲染),可复用进程,新增 `kg/` 模块
- 不允许引入新进程/新端口/新服务依赖
- 所有 LLM 调用必须走 `agent-orchestrator`(脱敏代理),POC 阶段允许临时绕过仅用于本地模型测试,生产代码必须改回
- sqlite-vec 扩展加载方式参考 better-sqlite3 文档,electron-builder `extraResources` 打包

### 输出物清单
- `_bmad-output/poc-artifacts/kg-rag/samples/` — 5 份样本 docx + 转 md
- `_bmad-output/poc-artifacts/kg-rag/markitdown-report.md`
- `_bmad-output/poc-artifacts/kg-rag/extraction-report.md`
- `_bmad-output/poc-artifacts/kg-rag/perf-report.md`
- `_bmad-output/poc-artifacts/kg-rag/retrieval-report.md`
- `_bmad-output/poc-artifacts/kg-rag/go-no-go-report.md`
- `apps/poc/plate-html-table-spike/` — Plate HTML 表 spike
- `apps/poc/sqlite-vec-spike/` — sqlite-vec 集成 spike

### 关键风险
1. markitdown 复杂表降级率高 → 触发方案 B(自定义 Plate 块 + OOXML)开发量
2. 本地 LLM 投标域抽取 F1 < 0.5 → 退而求其次:小模型仅做 chunk + entity link,实体定义靠运营人工维护
3. sqlite-vec 扩展在 Windows 加载失败 → 退路:`hnswlib` Python 侧自管 ANN 索引文件
4. 包体超 300MB 用户接受度 → 模型量化(int8)或下沉到首次启动按需下载

## Estimation

- 工时:5 ~ 8 人日(含样本采集、标注、测试)
- 不进入并行 worktree,在主分支 `_bmad-output/poc-artifacts/` 累积
