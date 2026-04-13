# Refactoring Plan — desktop-packages-plugins

_Plan drafted: 2026-04-13_

## Executive Summary
Phase 0 baseline found 340 source files / 53.9k LOC across the remaining
shared packages, residual Electron seams, and built-in plugins. There are no
current 500+ LOC violations, but there is a dense near-cap cluster exactly on
architecture-setting seams: shared host↔remote contracts, the AD-020 CLI/tool
bridge, kanban orchestration, and the largest built-in plugins. The right move
is still core-first: review `packages/common/src` and `packages/app-runtime/src`
before Electron seam cleanup, then treat plugin reviews as exemplar-driven
architecture work rather than alphabetical bookkeeping.

## Issues Found (prioritized)
- **High** — Near-cap pressure is concentrated on architecture-setting Electron
  seams — `apps/desktop/electron/features/kanban/core/orchestrator.ts:1-491`,
  `apps/desktop/electron/cli/core/tool.ts:1-474`,
  `apps/desktop/electron/cli/commands/integrations/google.ts:1-441`,
  `apps/desktop/electron/cli/commands/apps/app-control.ts:1-436`,
  `apps/desktop/electron/features/kanban/prompts/index.ts:1-423`,
  `apps/desktop/electron/cli/core/schema-bridge.ts:1-403`, and
  `apps/desktop/electron/features/kanban/review/workflow/review-executor.ts:1-400`
  are not leaf modules; they sit on AD-020 and AD-021-sensitive runtime paths.
  If they are reviewed after downstream plugin/UI areas, later recommendations
  will be working from stale ownership assumptions. Effort: **S**.

- **High** — Shared package ownership must be settled before plugin reviews —
  `packages/common/src/model-selection.ts:1-396`,
  `packages/common/src/plugins.ts:1-91`,
  `packages/app-runtime/src/sero-bridge.ts:1-102`,
  `packages/app-runtime/src/widget-registry.ts:1-97`, and
  `packages/app-runtime/src/use-widget-registration.ts:1-80` define the core
  host↔remote contracts that built-in plugin UIs and renderer code consume.
  Reviewing plugins first would encourage duplicate `shared/` contracts and
  plugin-local workarounds instead of fixing the canonical seam. Effort: **S**.

- **Medium** — Plugin debt is leverage-weighted, not alphabet-weighted —
  `plugins/sero-cron-plugin/extension/index.ts:1-473`,
  `plugins/sero-web-plugin/extension/gemini-web.ts:1-483`,
  `plugins/sero-memory-plugin/extension/memory-tool.ts:1-466`,
  `plugins/sero-kanban-plugin/ui/components/CardDetail.tsx:1-466`,
  `plugins/sero-admin-plugin/ui/hooks/useSeroFiles.ts:1-473`, and
  `plugins/sero-user-feedback-plugin/ui/QuestionnaireForm.tsx:1-469` show that
  the heaviest built-in plugins are also the ones most likely to set patterns
  that later plugins copy. Exemplar-first sequencing is the only high-leverage
  order here. Effort: **S**.

- **Medium** — Two queued targets are scope-cleanup items, not real source
  reviews — `apps/desktop/electron/gateway/` currently contains only generated
  `web-dist/` assets, and `plugins/sero-hello-world-plugin/` currently contains
  only generated temp/build output with no source `package.json`. Treating them
  like ordinary deslopify passes would waste review time and muddy the index.
  Effort: **S**.

- **Medium** — Early grep already shows type escape hatches at shared/runtime
  seams — `packages/app-runtime/src/context.ts:36`,
  `packages/app-runtime/src/widget-registry.ts:45`,
  `packages/app-runtime/src/sero-bridge.ts:97`,
  `apps/desktop/electron/cli/core/schema-bridge.ts:56-243`,
  `apps/desktop/electron/cli/core/tool.ts:431`,
  `apps/desktop/electron/cli/lib/gog-runner.ts:111-118`, and
  `plugins/sero-context-plugin/extension/index.ts:122-127,305` already show the
  exact kind of boundary drift the later folder-level reviews need to call out.
  Effort: **S**.

- **Low** — No immediate hard-rule emergency exists in this scope — baseline
  scan found no active `localStorage` / `sessionStorage` usage under these
  targets and no file currently exceeds 500 LOC. This means the wave can stay
  sequencing-first instead of being forced into emergency surgery. Effort: **S**.

## Proposed Refactoring
1. **Keep the tasklist’s core-first Wave A order and make its intent explicit.**
   - Review in this order: `packages/common/src` → `packages/app-runtime/src` →
     `apps/desktop/electron/types` → `apps/desktop/electron/cli` →
     `apps/desktop/electron/gateway` (scope check / likely no-op) →
     `apps/desktop/electron/features/kanban`.
   - Why: `packages/common` and `app-runtime` define the contracts that both the
     desktop host and plugin remotes consume. `electron/types` is tiny but sits
     on the same contract seam, so it should close quickly before the heavier
     AD-020 CLI review. `kanban` comes last because it is the deepest behavior
     surface and depends on those upstream ownership decisions.

2. **Treat plugin reviews as architecture exemplars, not a package census.**
   - Keep the Wave C order from the tasklist: `sero-kanban-plugin`,
     `sero-cron-plugin`, `sero-admin-plugin`, `sero-memory-plugin` first; then
     `sero-git-plugin`, `sero-context-plugin`, `sero-web-plugin`,
     `sero-user-feedback-plugin`; then `sero-alibaba-plugin` and the
     `sero-hello-world-plugin` scope check last.
   - During each plugin pass, review all four ownership seams together:
     `package.json` metadata, `extension/`, `shared/`, and `ui/`.
   - Why: later plugin plans should inherit conventions from the strongest
     exemplars instead of copying debt from whichever folder happened to be
     reviewed first.

3. **Make boundary ownership a required section in every downstream folder plan.**
   - Shared packages: identify which contracts belong in `@sero/common` versus
     `@sero-ai/app-runtime` versus plugin-local `shared/`.
   - Electron CLI: explicitly track AD-020 tool bridging, `sessionRuntime`, and
     schema parsing / command routing boundaries.
   - Kanban: explicitly track AD-018 container/worktree behavior and AD-021
     subagent orchestration assumptions.
   - Plugins: explicitly track manifest metadata, host bridge usage,
     module-federation runtime expectations, and duplicated shared types.

4. **Handle generated-only targets as documentation closeouts unless source is restored.**
   - For `apps/desktop/electron/gateway/` and `plugins/sero-hello-world-plugin/`,
     the review step should first confirm that the folder still contains only
     generated output. If that remains true, the resulting deslopify docs should
     record “no reviewable source” and close the item without inventing debt.
   - If real source appears later, rerun Phase 0 for that target before trying
     to slot it into the old wave order.

5. **Do not start any fix-slop work until Wave A facts/plans are complete.**
   - The shared-package + Electron seam reviews should produce one synthesis pass
     before any High-only execution begins.
   - Re-check downstream plugin plans after those shared High items land, because
     type ownership and host bridge guidance may change.

## Wave B synthesis — 2026-04-13

### Cross-cutting themes across the Wave A plans
1. **Boundary type escapes clustered on the host↔remote and AD-020 seams.**
   - `packages/app-runtime/src` and `apps/desktop/electron/cli/` both found the
     same root problem: the most reused runtime boundaries were the least
     truthful to the compiler.
   - Result: clear those typing seams first, before touching higher-risk runtime
     behavior.

2. **Kanban High work was one truthfulness batch, not two unrelated chores.**
   - The dead settings surface and the split host/plugin contract were both the
     same underlying issue: the shared/user-visible contract claimed more than
     the runtime actually guaranteed.
   - Result: move the shared contract into `@sero/common` and narrow the exposed
     settings in the same wave.

3. **Not every reviewed target had direct High code work.**
   - `packages/common/src` participated as the canonical home for the Kanban
     contract, but its own reviewed findings remain Medium.
   - `apps/desktop/electron/types` and `apps/desktop/electron/gateway` remained
     Wave B closeouts only.
   - Result: mark them complete in tracking docs instead of inventing churn.

### Recommended High-only `fix-slop` batches
| Batch | Targets | High items covered | Batch intent |
| --- | --- | --- | --- |
| **B1 — Shared/CLI boundary typing** | `packages/app-runtime/src`, `apps/desktop/electron/cli/` | Remove `globalThis` / `window.sero` / schema-walking / tool-update / exec-failure escape hatches | Make the host↔remote and AD-020 seams fail loudly at compile time again. |
| **B2 — Kanban contract truthfulness** | `packages/common/src`, `apps/desktop/electron/features/kanban/`, `plugins/sero-kanban-plugin/shared` | Move the shared Kanban contract into `@sero/common` and remove the dead settings surface | Align the shared/user-visible Kanban contract with the runtime Sero actually ships. |

### Wave B targets with no direct High items
- `packages/common/src` — no package-local High findings; participated only as
  the new shared Kanban contract owner.
- `apps/desktop/electron/types` — still a healthy narrow SDK augmentation seam.
- `apps/desktop/electron/gateway` — still generated-only / no reviewable source.

## Benefits & Trade-offs
- Benefits: keeps the highest-leverage contract decisions in front, reduces the
  chance of plugin-local duplicate types, prevents the AD-020 CLI bridge and
  kanban runtime from being reviewed through stale assumptions, and avoids
  wasting time on generated-only folders.
- Trade-offs: front-loads documentation work before visible plugin cleanup,
  means some nominal tasklist items may close as “no-op / generated-only”, and
  delays plugin-specific refactoring until the shared seams are better mapped.

## Dependencies & Risks
- `packages/common/src` findings may require future moves from plugin-local
  `shared/` folders or renderer-only types into `@sero/common`, which will
  create broad but healthy churn later.
- `packages/app-runtime/src` findings can affect every plugin UI mount, so later
  fix-slop work there must be validated against host↔remote runtime behavior,
  not just typecheck.
- `apps/desktop/electron/cli/**` changes are tied directly to AD-020. Any later
  fix-slop batch there needs targeted validation for bridged commands, schema
  parsing, and session-scoped execution.
- `apps/desktop/electron/features/kanban/**` sits on container, worktree,
  review, and subagent behavior. Even “cleanup-only” refactors there are
  runtime-sensitive and should be treated as behavior-risky until proven
  otherwise.
- If `apps/desktop/electron/gateway/` or `plugins/sero-hello-world-plugin/`
  grow real source later, this baseline becomes stale and should be refreshed
  before those items are executed.

## Next Steps
1. `deslopify packages/common/src`
2. `deslopify packages/app-runtime/src`
3. `deslopify apps/desktop/electron/types`
4. `deslopify apps/desktop/electron/cli`
5. Re-check `apps/desktop/electron/gateway/` for real source; if none exists,
   document it as a generated-only closeout and move on.
6. `deslopify apps/desktop/electron/features/kanban`
7. Start the plugin exemplar wave with `plugins/sero-kanban-plugin`,
   `plugins/sero-cron-plugin`, `plugins/sero-admin-plugin`, and
   `plugins/sero-memory-plugin`.
8. After Wave A is fully documented, write one shared-desktop synthesis note
   before any `fix-slop` batch starts.

Verification checklist for the downstream folder reviews:
- Confirm whether the folder owns canonical types or should import them from
  `@sero/common` / `@sero-ai/app-runtime` instead.
- Flag every `as any`, `as unknown as`, inline dynamic type import, or
  host-bridge cast on the folder’s boundary seams.
- Distinguish real source from generated output before creating debt findings.
- For plugin folders, review `package.json`, `extension/`, `shared/`, and `ui/`
  together so host integration issues are not split across multiple future plans.

## Execution log
- `7c5a8456` — `refactor(app-runtime): remove boundary type escape hatches`
- `8d8f7648` — `refactor(cli): harden AD-020 bridge typing`
- `e09e6fad` — `fix(kanban): centralize shared contract and remove dead settings`
