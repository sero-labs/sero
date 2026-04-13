# Refactoring Plan — plugins/sero-context-plugin

_Plan drafted: 2026-04-13_

## Executive Summary
`plugins/sero-context-plugin/` is small, coherent, and already under every file-size limit, but its biggest debt is runtime truthfulness rather than raw mess. The package markets a real-time, interactive context dashboard, yet the snapshot only updates when the context tools run and the UI’s “actions” merely ask the model to do something later. The right outcome is a truthful snapshot/update contract, deterministic or honestly-labeled UI actions, one shared projection layer for both the TUI log and UI snapshot, and enough type/test coverage that this plugin stays a reliable exemplar instead of a clever demo.

## Issues Found (prioritized)
- **High** — The dashboard is not actually real-time; it only refreshes when the context tools run — `plugins/sero-context-plugin/extension/index.ts:94-97` only records `statePath` on session start/switch, while snapshot writes happen only inside the three tool handlers at `plugins/sero-context-plugin/extension/index.ts:140`, `plugins/sero-context-plugin/extension/index.ts:177`, and `plugins/sero-context-plugin/extension/index.ts:222`. The `/context` command at `plugins/sero-context-plugin/extension/index.ts:250-257` only asks the agent to use `context_log` later. That conflicts with the README promise that the UI renders the graph “in real time” (`plugins/sero-context-plugin/README.md:50`) and leaves normal turns/branch changes invisible until the model cooperates. Effort: **M**.
- **High** — The UI advertises direct tag/checkout actions, but every action is really a prompt to the agent — `plugins/sero-context-plugin/ui/ContextApp.tsx:29-44` turns refresh/tag/checkout into `useAgentPrompt()` strings, `plugins/sero-context-plugin/ui/components/ContextTimeline.tsx:177-230` labels those prompt triggers as `Checkout here` / `Tag`, and the README explicitly sells these as “Interactive Actions” (`plugins/sero-context-plugin/README.md:25`). In Sero specifically, that is a truthfulness problem: the UI looks deterministic but actually depends on model compliance and prompt interpretation. Effort: **M**.
- **Medium** — Log rendering and snapshot rendering duplicate the same projection logic in two places — `plugins/sero-context-plugin/extension/index.ts:262-362` and `plugins/sero-context-plugin/extension/snapshot.ts:30-215` each rebuild sequence expansion, content extraction, interesting-node filtering, tag-distance calculation, and assistant/tool-call parsing. This will drift the TUI `context_log` output away from the UI graph over time, especially because both copies already rely on local `any` casts around message content. Effort: **M**.
- **Medium** — The package-local quality gate covers only the UI, not the extension that owns all behavior — `plugins/sero-context-plugin/package.json:13` runs `tsc --noEmit -p ui/tsconfig.json`, and the package contains no `*.test.*` / `*.spec.*` files at all. That leaves `extension/index.ts`, `extension/snapshot.ts`, and `extension/helpers.ts` outside the package’s own type/test discipline even though they own the session-history mutations and snapshot contract. Effort: **S**.
- **Low** — A few type escape hatches and swallowed snapshot failures are already visible in the hot path — `plugins/sero-context-plugin/extension/index.ts:122-127,305` and `plugins/sero-context-plugin/extension/snapshot.ts:47-58` use `as any` around session message content/tool-call parsing, while `plugins/sero-context-plugin/extension/index.ts:75-85` logs snapshot-write failures to stderr and otherwise fails silent. None are catastrophic today, but they weaken a package whose whole job is introspection. Effort: **S**.

## Proposed Refactoring
1. **Make snapshot freshness truthful and explicit.**
   - Decide whether the plugin should truly be live or explicitly manual.
   - Preferred shape: write an initial snapshot on session entry and subscribe to the narrowest available session-history events so the state file stays current even when the model never calls `context_log`.
   - If the Pi SDK cannot provide a safe event for this today, then downgrade the copy instead of pretending: change the README/UI language from “real time” to “manual snapshot / refresh.”
   - This is a behavior-preserving clarity fix if you only change copy; it becomes a runtime change if you add automatic snapshot writes, so verify performance and churn before broadening it.

2. **Replace prompt-shaped UI actions with a truthful execution path, or label them honestly.**
   - Preferred end state: add a small plugin-owned action seam so the UI can request `tag`, `log refresh`, and `checkout` deterministically instead of hoping the model follows a prompt.
   - If that bridge is too much churn for one pass, do the conservative interim fix first:
     - rename buttons to `Ask agent to tag` / `Ask agent to checkout`
     - surface a note that the action is prompt-routed
     - remove “Interactive Actions” language from the README
   - Keep the existing AD-020 tool registrations; the change is about UI truthfulness, not about moving agent-facing actions out of tools.

3. **Extract one shared context projection module.**
   - Target structure:
     - `plugins/sero-context-plugin/extension/context-projection.ts`
       - sequence expansion
       - content extraction
       - interesting-node filter
       - steps-since-tag calculation
       - assistant/tool-call parsing helpers
     - `extension/index.ts` consumes it for `buildLogText()`
     - `extension/snapshot.ts` consumes it for `buildSnapshot()`
   - This removes the current “same algorithm twice” drift surface and gives the package one canonical meaning of “interesting node.”
   - While doing this, replace the local `as any` walkers with narrow helpers over the actual session message/content shapes.

4. **Bring the extension into the package’s own quality gate.**
   - Add a package-local tsconfig (or expand the existing one) so `extension/`, `shared/`, and `ui/` all typecheck together.
   - Add focused tests around pure logic first:
     - `resolveTargetId()`
     - projection / hidden-node behavior
     - steps-since-tag calculation
     - snapshot usage breakdown math
   - This gives the plugin regression coverage without forcing a heavyweight end-to-end harness in the first pass.

5. **Surface snapshot-write failures more explicitly.**
   - Keep snapshot failures non-fatal to agent turns, but stop making them invisible.
   - Options:
     - persist a small `lastError` / `syncStatus` field in state for the UI
     - emit a visible follow-up message when repeated writes fail
     - at minimum, centralize the failure path so future retries/backoff logic has one owner
   - Do this after the freshness/action truthfulness work so the package does not grow a parallel status channel for fundamentally misleading behavior.

## Benefits & Trade-offs
- Benefits:
  - Restores truthfulness between what the README/UI promise and what the plugin actually does.
  - Prevents the TUI log and UI snapshot from quietly drifting into two different interpretations of the same session graph.
  - Gives the extension real package-local type/test coverage.
  - Keeps the plugin small and exemplar-worthy without a rewrite.
- Trade-offs:
  - A deterministic UI action path likely needs a small new bridge seam, which is more coordination than simply rewording buttons.
  - Automatic snapshot updates may add extra writes on long sessions, so they need a lightweight trigger strategy.
  - Consolidating the projection logic touches the package’s two central behavior files at once, so review should stay focused.

## Dependencies & Risks
- The snapshot-freshness fix is runtime-sensitive. If automatic writes are added, verify that success-path behavior and session responsiveness stay stable on long branches.
- A truthful UI action path may need host/app-runtime support beyond the package folder. If that cannot be landed immediately, the interim copy fix should ship first rather than waiting.
- Consolidating projection logic must preserve the current `context_log` output shape closely enough that the bundled skill and existing user habits still make sense.
- Expanding typecheck coverage may surface real SDK-boundary typing gaps around `SessionEntry` content; that is desirable, but budget for a small amount of type cleanup.

## Next Steps
1. Decide the desired truthfulness contract for the dashboard: live snapshot vs explicitly manual snapshot.
2. Fix the UI copy/actions to match reality, or add a small deterministic action bridge if that work is ready now.
3. Extract a shared `context-projection` module and make both `buildLogText()` and `buildSnapshot()` consume it.
4. Expand the package-local typecheck to include `extension/` and `shared/`.
5. Add focused tests for projection, target resolution, and usage math.

Verification checklist:
- Starting or switching into a session gives the Context app a truthful initial state without relying on the model to call `context_log` first, or the UI/README now clearly say it is manual.
- Clicking the timeline actions either performs the action deterministically or is explicitly labeled as an agent prompt request.
- The same branch/tag sequence produces matching structure in both the TUI `context_log` output and the UI timeline.
- Package-local typecheck fails on extension typing regressions, not just UI regressions.
- Snapshot-write failures are visible enough that users are not left with a silently stale dashboard.
