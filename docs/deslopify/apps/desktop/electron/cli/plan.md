# Refactoring Plan — apps/desktop/electron/cli

_Plan drafted: 2026-04-13_

## Executive Summary
`electron/cli` is strategically important and better tested than most runtime seams, but it still carries concentrated debt exactly where AD-020 is most sensitive: schema parsing and bridge execution still lean on `any`, the main batch/tool runtime is split across near-cap mixed-responsibility files, and the app-control command duplicates an existing renderer-control path instead of reusing a host-owned service. The goal is not to rewrite the CLI; it is to make the bridge truthful, typed, and easier to extend without regressing prompt-block generation, session scoping, or rich-output behavior.

## Issues Found (prioritized)
- **High** — Type escape hatches remain on the AD-020 bridge boundary — `apps/desktop/electron/cli/core/schema-bridge.ts:56-67`, `apps/desktop/electron/cli/core/schema-bridge.ts:150-174`, `apps/desktop/electron/cli/core/schema-bridge.ts:231-243`, and `apps/desktop/electron/cli/core/schema-bridge.ts:395` still walk tool schemas and bridged command contexts through `any`; `apps/desktop/electron/cli/core/tool.ts:431` casts the streaming update callback; and `apps/desktop/electron/cli/lib/gog-runner.ts:111-118` still reads exec failures through `error as any`. On Sero's single-tool bridge, that hides upstream SDK/schema drift exactly where the compiler should be loud. Effort: **M**.

- **Medium** — The core AD-020 runtime is concentrated in two near-cap orchestration files — `apps/desktop/electron/cli/core/tool.ts:1-474` combines batch parsing, timeout control, rate limiting, legacy-image fallback, invocation assembly, and tool creation; `apps/desktop/electron/cli/core/schema-bridge.ts:1-403` combines schema introspection, coercion, help generation, result extraction, tool bridging, and slash-command bridging. Both files are still under the 500-LOC rule, but they are already expensive to review safely. Effort: **M**.

- **Medium** — `app-control` duplicates the existing host-side renderer automation bridge and adds timing heuristics on top — `apps/desktop/electron/cli/commands/apps/app-control.ts:28-44` recreates the same `BrowserWindow` + `executeJavaScript()` helper pattern that already exists in `apps/desktop/electron/ipc/apps/app-control.ts:35-99`; `app-control.ts:201-207` then adds a hardcoded 500ms sleep after `openApp()` before screenshot capture. That creates two main-process copies of the same fragile UI automation seam. Effort: **M**.

- **Medium** — Two built-in command routers are already near cap and organized as nested switch forests — `apps/desktop/electron/cli/commands/integrations/google.ts:34-358` combines auth, Gmail, and Calendar flows in one file, while `apps/desktop/electron/cli/commands/apps/app-control.ts:120-403` mixes navigation, screenshots, interactions, recording, and preview lifecycle. New CLI features here will increase churn faster than the tests can localize it. Effort: **M**.

- **Low** — Shared CLI flag parsing is narrower than the command surface now expects — `apps/desktop/electron/cli/lib/utils.ts:13-42` only understands `--long` flags, which already forced one local workaround in `apps/desktop/electron/cli/commands/vcs/vcs.ts:46-56` to strip accidental `-m`. That is not breaking the bridge today, but it is already producing command-local parsing hacks. Effort: **S**.

## Proposed Refactoring
1. **Remove the remaining `any`/unsafe casts from the bridge core first.**
   - Introduce typed schema access helpers for `properties`, `required`, `anyOf`, and nested object-array shapes so `schema-bridge.ts` stops treating TypeBox/JSON Schema input as a bag of `any`.
   - Give bridged slash commands an explicit Sero-owned command context type instead of `buildCommandContext(ctx) as any`.
   - Replace the `gog-runner.ts` exec callback casts with a small typed exec-failure normalizer, mirroring the pattern already used elsewhere in desktop Electron code.
   - Aligns directly with AD-020's goal: one bridge surface that fails loudly at compile time instead of drifting silently.

2. **Split `core/tool.ts` by runtime concern before it crosses the cap.**
   - Target shape:
     - `core/batch-executor.ts` — command loop, truncation, rate limiting, single-vs-multi result shaping
     - `core/timeout-control.ts` — timeout/abort orchestration
     - `core/invocation-context.ts` — `sessionRuntime`, invocation assembly, agent-context extraction
     - `core/tool.ts` — thin `createSeroCliTool()` composition root
   - Preserve public exports from `core/index.ts` so `agent.ts`, subagent runtime, and container tools do not need broad rewiring.

3. **Extract a shared main-process app-control service and make CLI + IPC consume it.**
   - Move the duplicated `BrowserWindow` / `executeJavaScript()` / screenshot helpers into one host-owned module under the existing app-control domain.
   - Keep the behavior-sensitive renderer calls in one place, then have both `electron/ipc/apps/app-control.ts` and `cli/commands/apps/app-control.ts` delegate to it.
   - Replace the fixed `setTimeout(500)` app-switch delay with an explicit readiness check or a shared post-open settle helper tied to the app-control bridge.
   - This aligns with Sero's IPC layering rules more closely than maintaining a second ad-hoc renderer bridge inside the CLI.

4. **Split the two near-cap command routers by domain.**
   - `commands/integrations/google.ts` → `google-auth.ts`, `google-gmail.ts`, `google-calendar.ts`, with one small top-level router.
   - `commands/apps/app-control.ts` → `app-navigation.ts`, `app-screenshot.ts`, `app-interactions.ts`, `app-recording.ts`, `app-preview.ts`.
   - Keep the command names and help text unchanged so the prompt block and existing tests stay valid.

5. **Tighten shared CLI argument utilities.**
   - Either explicitly keep the bridge “long flags only” and document it in help output, or add scoped short-flag support in `parseFlags()` so command files stop carrying one-off cleanup logic.
   - Prefer a truthful shared rule over silent per-command exceptions.

## Benefits & Trade-offs
- Benefits: stronger compile-time guarantees on the AD-020 seam, fewer duplicate app-control fixes, smaller modules with narrower review surfaces, and clearer ownership between generic CLI runtime and individual command families.
- Trade-offs: moderate churn across the agent/runtime integration points, plus test updates anywhere exports or helper locations move. App-control extraction is behavior-sensitive because screenshots, recording, and preview startup all depend on renderer timing.

## Dependencies & Risks
- Any bridge-core refactor must preserve current session-scoped resolution for bridged tools and bridged slash commands; a clean type refactor that accidentally reintroduces registration-time closure capture would be a runtime regression.
- `core/tool.ts` extraction must preserve `details.richOutputFallback`, multi-command truncation behavior, interactive timeout exemptions, and turn-budget accounting.
- App-control service extraction touches both CLI and IPC paths; it should be validated against the existing renderer bridge in `src/lib/app-control-bridge.ts` so screenshot, inspect, record, and preview flows stay identical.
- Google runner hardening must preserve the current host-vs-container routing semantics and Sero-managed credential injection.

## Next Steps
1. Remove the `any`/unsafe casts in `schema-bridge.ts`, `core/tool.ts`, and `lib/gog-runner.ts`.
2. Extract `core/tool.ts` into batch/timeout/context helpers while preserving current public exports.
3. Introduce a shared app-control host service and switch both IPC and CLI command handlers to it.
4. Split `google.ts` and `app-control.ts` into smaller domain modules.
5. Verification checklist:
   - Run a bridged extension tool from a normal agent session and from a subagent session, confirming session-local resolution still works.
   - Run a multi-command batch where one command emits rich/image content and confirm `richOutputFallback` behavior is unchanged.
   - Run an interactive bridged command (`question`/`questionnaire`) and confirm timeout exemptions still apply.
   - Smoke-test `sero app screenshot`, `sero app record start/stop`, and `sero app preview` after the app-control extraction.
   - Smoke-test `sero google auth list` / Gmail / Calendar on both host and container-backed workspaces.
