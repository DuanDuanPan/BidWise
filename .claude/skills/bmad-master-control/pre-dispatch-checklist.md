# Pre-Dispatch Checklist (v2 Redirect)

> **v2 Note:** Pre-dispatch validation is now enforced automatically by the transition engine's
> preconditions and the command gateway's trigger-seq enforcement.
>
> The commander issues `DISPATCH` commands through `command-gateway.sh`, which validates:
> - Generation fencing (stale commander detection)
> - trigger-seq dedup (prevents duplicate dispatch)
> - LLM assignment per C2 rule (via `LLM_FOR_PHASE` table)
> - Constitution check recorded in `TASK_DISPATCHED` event payload
>
> This file is retained for historical reference only.
> See `transition-engine.sh` for the complete precondition definitions.
