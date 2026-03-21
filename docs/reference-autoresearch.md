# Reference: Karpathy's AutoResearch

**Source:** https://github.com/karpathy/autoresearch
**Retrieved:** 2026-03-16
**Stars:** 37,000+ | **License:** MIT

## Project Vision

Enable AI agents to autonomously conduct LLM research experiments. The idea is to "give an AI agent a small but real LLM training setup and let it autonomously run experiments overnight."

The agent modifies code, trains for 5 minutes, checks if results improved, then decides to keep or discard modifications. Users get experiment logs and (hopefully) better models in the morning.

## Core Architecture

### Tech Stack

- Python 3.10+
- PyTorch (deep learning framework)
- Single NVIDIA GPU (H100 as test platform)
- uv (project manager)
- Minimal dependencies, no distributed training

### File Structure

- `prepare.py` — Fixed constants, data preparation, runtime tools (NOT modified by agent)
- `train.py` — Model, optimizer, training loop (MODIFIED by agent)
- `program.md` — Agent instructions (EDITED by human)
- `pyproject.toml` — Dependency declarations

## Key Design Principles

### 1. Fixed Time Budget

Training always runs exactly 5 minutes (excluding startup/compilation), making experiments comparable. This means approximately 12 experiments per hour, ~100 experiments during sleep.

### 2. Single Metric

`val_bpb` (validation bits-per-byte) — lower is better, independent of vocabulary size, enabling fair comparison across architecture changes.

### 3. "One GPU, One File, One Metric"

Self-contained design. Only PyTorch and minimal packages needed. No complex configuration.

### 4. Markdown-Driven Agent Instructions

Revolutionary use of Markdown files as "ultra-lightweight skills" to guide agents. `program.md` serves as the research organization code rather than traditional codebase.

### 5. Autonomous Experiment Loop

Fully automated experiment → evaluate → decide loop with no human intervention required.

## Agent Interaction Model

- Agent reads `program.md` for instructions (described as "ultra-lightweight skills")
- Users can interact via Claude, Codex, or other LLMs
- Recommended launch prompt: "Look at program.md, let's start a new experiment!"
- Agent can modify: model architecture, hyperparameters, optimizer, batch size, anything in `train.py`
- Design philosophy: Only modifying a single file keeps scope manageable and diffs reviewable

## Relevance to Our System

| AutoResearch Concept    | Mapping to Proposal System                      |
| ----------------------- | ----------------------------------------------- |
| Fixed time budget       | Time-budgeted proposal generation phases        |
| Single metric (val_bpb) | Win rate / scoring prediction as north star     |
| Autonomous loop         | Overnight multi-variant proposal generation     |
| program.md instructions | Intent-driven agent architecture                |
| Keep/discard decision   | A/B proposal variant selection                  |
| One file constraint     | Stems architecture — each chapter as one "file" |
