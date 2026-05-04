# Pi SDK 0.72 Migration Notes

Sero upgraded its Pi SDK integration from 0.61.1 to 0.72.1. This note only covers Sero-facing migration details; use the Pi changelog for the full upstream release history.

## Provider credentials

Sero continues to store Pi credentials under `~/.sero-ui/agent/auth.json` and does not use `~/.pi/agent`.

The auth UI mirrors the Pi 0.72.1 API-key provider set used by Sero, including DeepSeek, Cloudflare Workers AI, Cloudflare AI Gateway, Moonshot, Fireworks, MiniMax, OpenCode Go, and Xiaomi MiMo API billing. Removed Pi providers `google-gemini-cli` and `google-antigravity` are not shown as built-ins.

Pi documents Xiaomi Token Plan provider IDs (`xiaomi-token-plan-*`), but the installed `@mariozechner/pi-ai@0.72.1` package does not export them. Sero therefore exposes the Xiaomi API-billing provider (`xiaomi`) only. Users with Token Plan credentials should keep those credentials outside Sero until the provider IDs are exported by Pi and added to Sero's auth catalog.

## Plugin author notes

Plugin tools should use `typebox` 1.x for Pi-facing schemas:

```ts
import { Type } from 'typebox';
```

Do not use `@sinclair/typebox` for new Pi tool schemas. Custom provider models should place thinking mappings on model objects via `thinkingLevelMap`; do not put `reasoningEffortMap` in provider `compat`.

For extension lifecycle hooks, use Pi 0.72 events such as `session_start`, `session_before_switch`, `session_shutdown`, and `session_tree`. The old `session_switch` / `session_fork` hooks are not part of the 0.72.1 typed API.
