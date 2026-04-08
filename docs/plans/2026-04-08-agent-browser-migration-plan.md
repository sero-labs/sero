# Agent Browser Migration Analysis (Playwright Helper → Vercel agent-browser)

Date: 2026-04-08

## Scope

This plan evaluates replacing the current container browser control stack:

- `apps/desktop/electron/features/container/support/browser-helper.py`
- `apps/desktop/electron/features/container/tools/tools-browser.ts`

with Vercel `agent-browser`.

## Executive Recommendation

**Recommended:** migrate to `agent-browser`, but do it in a **phased hybrid rollout** behind a feature flag.

Why:

- `agent-browser` has richer agent-centric primitives (refs/snapshots, semantic finders, richer interaction/getters, stream/profiler/trace tools).
- It reduces long-term maintenance on our custom Python TCP server and action protocol.
- It can target local browser sessions or remote providers (Browserbase) with near-identical command surface.

Caution:

- Our current tool returns image blocks directly to the model, and has bespoke recording behavior (MP4 generated host-side from screenshots). That behavior must be preserved or intentionally changed.
- We currently execute inside workspace containers; `agent-browser` install/runtime prerequisites need deterministic bootstrap for Linux container images.

## Current State (what we have today)

### Architecture

1. TypeScript tool (`tools-browser.ts`) ensures helper injection, starts a long-lived TCP server in-container, and sends JSON actions via `python3 ... --send`.
2. Python helper (`browser-helper.py`) owns browser lifecycle as process-global state (`_browser`, `_context`, `_page`) and dispatches a compact action set.
3. Screenshot responses are base64-encoded and surfaced as tool image blocks. Large screenshots may be JPEG-compressed in container before returning.
4. Video recording is not native Playwright video capture; it is periodic screenshot sampling in TS and then host-side MP4 encoding.

### Functional Surface Today

Supported actions today are intentionally narrow:

- `launch`, `navigate`, `click`, `type`, `press_key`, `screenshot`, `scroll`, `evaluate`, `get_text`, `wait`, `close`
- `start_recording` / `stop_recording` (custom)

This is stable and tailored, but leaves us maintaining transport + browser orchestration ourselves.

## What `agent-browser` adds

Based on upstream docs/README, `agent-browser` provides:

- Native CLI with many browser ops beyond current surface (hover, drag, upload, check/uncheck, semantic finders, richer getters).
- Accessibility snapshots with element refs (`@e1`) which is significantly more LLM-friendly than relying on brittle CSS selectors only.
- Runtime extras: stream enable/disable/status, profiler, tracing, and command-level JSON outputs.
- Session/provider flexibility: local browser or provider-backed sessions (e.g. Browserbase) via env/flags.

## Fit Assessment for Sero

### Strong positives

- **LLM ergonomics:** snapshot refs + semantic finders should improve success rates for autonomous UI tasks.
- **Capability depth:** closes many gaps without custom implementation.
- **Operational leverage:** less bespoke Python server logic to debug/restart/keep alive.
- **Future options:** provider abstraction enables running in constrained environments later.

### Risks / migration costs

- **Behavior parity risk:** existing agent prompts/tool expectations are tuned to our current action names and return shapes.
- **Output contract changes:** we must keep returning tool content blocks (text/image) in the format the rest of Sero expects.
- **Recording parity:** decide whether to keep MP4 pipeline or adopt `agent-browser` native recording (WebM) and optionally transcode.
- **Dependency/runtime:** need guaranteed availability in each container image and robust version pinning.
- **Latency:** CLI invocation per action may add overhead unless daemon/session mode is used consistently.

## Decision

**Yes — good idea**, with the following implementation stance:

1. **Adopt `agent-browser` as backend engine** for the browser tool.
2. **Keep Sero tool API stable initially** (same external `browser` tool, same high-level actions) via translation adapter.
3. **Add opt-in expanded actions later** once baseline parity is proven.
4. **Roll out behind feature flag** + fallback to legacy Python helper.

## Migration Plan

## Phase 0 — Preconditions & discovery (1–2 days)

- Pin target `agent-browser` version.
- Validate Linux container bootstrap command sequence (install binary + Chrome dependencies).
- Run smoke tests in a fresh workspace container:
  - open URL, snapshot, click by ref, type, screenshot, get text, close.
- Produce a compatibility table: current action → `agent-browser` command mapping.

Deliverable: approved compatibility matrix + bootstrap script.

## Phase 1 — New backend adapter (2–3 days)

- Add `AgentBrowserBackend` in `apps/desktop/electron/features/container/tools/`.
- Keep `createBrowser()` public interface unchanged.
- Implement action translation:
  - `launch` → `open` (+ optional viewport/config if supported)
  - `navigate` → `open`
  - `click` → `click` (selector or coordinate strategy)
  - `type`/`press_key`/`scroll`/`evaluate`/`get_text`/`wait`/`close`
- Parse `--json` outputs and normalize into existing Sero response schema.
- Preserve screenshot image-block return shape.

Deliverable: browser tool runs on new backend with no prompt-level changes.

## Phase 2 — Session lifecycle & reliability (2 days)

- Introduce per-workspace session management for `agent-browser`.
- Prefer daemon/session mode to avoid cold start per command.
- Implement health checks and restart logic equivalent to current `--ping` workflow.
- Add explicit cleanup on workspace/container shutdown.

Deliverable: reliability equal or better than Python TCP helper.

## Phase 3 — Recording parity (1–2 days)

Choose one path:

- **A (low risk):** keep current frame-capture + MP4 encoder pipeline while backend changes.
- **B (simpler long term):** use `agent-browser record start/stop` (WebM), then transcode if MP4 is required by downstream UX.

Recommendation: start with **A**, then evaluate **B** after parity rollout.

Deliverable: unchanged UX for `start_recording` / `stop_recording`.

## Phase 4 — Feature-flag rollout (2 days)

- Add config gate, e.g. `SERO_BROWSER_BACKEND=legacy|agent_browser`.
- Default internal/dev workspaces to `agent_browser`, production default still `legacy`.
- Collect metrics:
  - action success rate
  - median action latency
  - crash/restart frequency
  - screenshot return failures

Deliverable: data-backed go/no-go decision.

## Phase 5 — Expand action surface (optional, post-parity)

Expose additional high-value `agent-browser` actions in schema and prompts:

- `snapshot`, semantic `find ...`, hover/drag/upload/check/uncheck
- richer `get` actions (title/url/attr/count/box)
- trace/profile toggles for debugging

Deliverable: improved agent browsing effectiveness.

## Phase 6 — Decommission legacy path (1 day)

After stable period (e.g. 1–2 weeks):

- Remove Python helper injection/startup code.
- Remove legacy backend and associated tests.
- Keep one release worth of rollback flag if desired.

Deliverable: reduced maintenance surface.

## Proposed file-level changes (implementation guide)

- **Keep:** `tools-browser.ts` as the stable public tool wrapper.
- **Add:** `tools-browser-agent-backend.ts` (new backend adapter).
- **Add:** `tools-browser-legacy-backend.ts` (optional extraction of current behavior for clean flagging).
- **Keep initially:** `support/browser-helper.py` for fallback.
- **Update:** `tool-schemas.ts` only after parity rollout if expanding action set.

## Success Criteria

- Zero regressions in existing browser-tool workflows.
- Typecheck passes monorepo-wide.
- 95%+ parity success rate vs legacy in scripted smoke suite.
- No increase in container CPU/memory instability.
- Mean action latency not worse than +20% (or better).

## Rollback Plan

- Keep legacy backend and runtime helper through rollout.
- Feature flag can switch all workspaces back to `legacy` without redeploying images.
- Preserve compatibility tests for both backends until removal phase.

## Suggested immediate next steps

1. Implement Phase 0 matrix and a tiny PoC adapter for `launch/navigate/screenshot/close`.
2. Add feature flag plumbing and backend switch.
3. Run side-by-side smoke tests in one workspace.
