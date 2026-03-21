# Reference: OpenClaw

**Source:** https://github.com/openclaw/openclaw
**Retrieved:** 2026-03-16
**Stars:** 316,000+ | **Forks:** 60,500+ | **Commits:** 19,490

## Project Vision

A **personal AI assistant** users operate on their own devices across any OS and platform. Core mission emphasizes being "local, fast, and always-on" rather than cloud-dependent. Fundamentally about **user agency** — providing an assistant that respects individual control rather than corporate intermediation.

## Core Architecture

### Gateway (Control Plane)

Local WebSocket-based Gateway running at `ws://127.0.0.1:18789`, serving as the single control plane for:

- Session management
- Channel routing
- Tool invocation
- Event streaming
- Configuration persistence

### Architecture Layers

```
Channels (WhatsApp/Telegram/Slack/Discord/etc.)
↓
Gateway (WebSocket control plane)
↓
Pi Agent Runtime (RPC mode with tool/block streaming)
↓
Tools (browser, canvas, nodes, cron, webhooks)
```

### Runtime Requirements

- Node.js ≥22
- TypeScript primary language
- Supports npm, pnpm, or bun

## Key Design Principles

### 1. Local-First Philosophy

- Gateway binds to loopback (127.0.0.1) by default
- Optional Tailscale Serve (tailnet-only) or Funnel (public) wrapping
- Clients connect via SSH tunnels or Tailscale for remote access

### 2. Multi-Channel Support

Integrates 20+ platforms: WhatsApp, Telegram, Slack, Discord, Google Chat, Signal, iMessage, IRC, Microsoft Teams, Matrix, Feishu, LINE, and more.

### 3. Security-First DM Policy

- `dmPolicy="pairing"`: Unknown users get short codes, message ignored until approved
- Explicit opt-in required for open DM acceptance
- System-level permissions tracked separately

### 4. Agent-to-Agent Communication

Three specialized tools enable coordination:

- `sessions_list`: Discover active agents/metadata
- `sessions_history`: Fetch transcript logs
- `sessions_send`: Inter-session messaging with optional reply-back

### 5. Canvas + A2UI Architecture

Agent-driven visual workspace that:

- Renders structured UI components (A2UI standard)
- Supports push/reset/eval/snapshot operations
- Available on macOS, iOS, and Android
- Enables interactive agent-human collaboration

### 6. Skills & Extensibility

- **ClawHub**: Minimal skill registry for automatic discovery
- **Workspace skills**: Local bundled and managed skills
- Install gating: UI-driven skill installation workflow
- Installation roots: `~/.openclaw/workspace/skills`

### 7. Device Node Architecture

Separate paired nodes for each device:

- macOS node: Canvas, camera, screen, `system.run`, `system.notify`
- iOS node: Canvas, voice, camera, screen
- Android node: Full device command family

### 8. Voice & Multimodal

- Voice Wake: Wake words on macOS/iOS for activation
- Talk Mode: Continuous voice input on Android
- ElevenLabs + system TTS fallback

## Session Model

- **Main sessions**: Direct chats with persistent state
- **Group isolation**: Separate agent contexts per group
- **Activation modes**: Mention-based or always-active
- **Queue modes**: Sequential or parallel message handling
- **Model failover**: Automatic fallback when primary unavailable

## Relevance to Our System

| OpenClaw Concept     | Mapping to Proposal System                                        |
| -------------------- | ----------------------------------------------------------------- |
| Local-first gateway  | Electron local client — proposals contain trade secrets           |
| Multi-channel        | Multi-device access (desktop edit, mobile review, tablet present) |
| Agent-to-Agent comms | Adversarial agents discussing and debating proposals              |
| Skills/plugins       | Pluggable review roles (compliance, security, domain-specific)    |
| Canvas + A2UI        | Rich interactive editing workspace                                |
| Session persistence  | Proposal project state management                                 |
| Security-first       | Local data storage, API proxy for desensitization                 |
| Device nodes         | Different capabilities per device context                         |
