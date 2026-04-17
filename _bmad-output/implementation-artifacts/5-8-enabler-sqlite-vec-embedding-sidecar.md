# Story 5.8 [Enabler]: sqlite-vec 集成与 BGE embedding sidecar

Status: backlog

> **Depends on:** 5-7 POC Go 决策。POC 报告通过后才启动。

## Story

As a 后端工程师,
I want 在 better-sqlite3 上集成 sqlite-vec 扩展并搭建 Python 侧本地 BGE embedding 服务,
So that 后续 5-9 / 5-10 可基于本地向量能力构建混合检索与知识图谱。

## Acceptance Criteria (草稿)

1. sqlite-vec 扩展通过 electron-builder 打包,三平台(macOS arm64 / Windows x64 / Linux x64)首次启动可加载
2. Kysely schema 新增 `chunks_vec(id, embedding FLOAT[N])` 虚拟表,N 取 POC 决定的模型维度
3. Python sidecar 新增 `/embed` 端点,接收文本数组,返回 embedding;走 onnxruntime 本地推理
4. 模型权重通过 electron-builder `extraResources` 内置或首次启动按需下载(POC 决定)
5. 入库时通过 `task-queue` 异步触发 embedding,不阻塞同步检索
6. 内存占用常驻 < 800MB,推理延迟 P99 < 100ms / chunk

## Tasks (待 POC 后细化)

- [ ] better-sqlite3 加载 sqlite-vec
- [ ] Kysely 迁移 + schema 类型
- [ ] Python sidecar embedding 端点
- [ ] 模型分发策略
- [ ] task-queue 集成
- [ ] 跨平台打包验证

## Dev Notes

待 5-7 POC 报告完成后细化。
