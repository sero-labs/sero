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

## Wave D synthesis — 2026-04-13

### Repeated plugin architecture issues across the Wave C plans
1. **Persisted state truthfulness is still the most repeated plugin failure mode.**
   - `plugins/sero-kanban-plugin`, `plugins/sero-cron-plugin`,
     `plugins/sero-memory-plugin`, `plugins/sero-git-plugin`, and
     `plugins/sero-web-plugin` all still treat malformed/unreadable JSON too
     much like "first run," which means the next successful write can erase
     real board/scheduler/snapshot/web state.
   - Result: the first Wave D execution batch should harden read paths and any
     shared persisted contracts before broader UI or module-shape cleanup.

2. **Remote UIs still too often own behavior that belongs to the extension/host.**
   - `plugins/sero-kanban-plugin` bypasses extension-owned review/worktree/cache
     side effects, `plugins/sero-web-plugin` mutates bookmarks/history/downloads
     directly from React, and `plugins/sero-context-plugin` presents
     prompt-routed actions as if they were deterministic UI commands.
   - Result: fix-slop should treat "truthful UI→extension action ownership" as
     one shared pattern, not three unrelated plugin chores.

3. **Canonical contract ownership is drifting across plugin↔host seams.**
   - `plugins/sero-admin-plugin` duplicates and narrows `window.sero` types,
     `plugins/sero-git-plugin` already has action-contract drift across shared
     types/app-runtime/preload/UI layers, `plugins/sero-memory-plugin` mirrors
     cron persisted types locally, and `plugins/sero-web-plugin` keeps a local
     host bridge declaration next to direct state writes.
   - Result: shared contract/bridge cleanup should land as a coordinated batch
     so drift becomes a typecheck failure instead of a runtime surprise.

4. **Several High findings are really Sero-first lifecycle/home-semantic issues.**
   - `plugins/sero-cron-plugin` startup recovery is not the truthful owner of
     reminder transitions, `plugins/sero-memory-plugin` and
     `plugins/sero-web-plugin` still drift toward legacy `~/.pi` fallbacks, and
     `plugins/sero-context-plugin` plus `plugins/sero-user-feedback-plugin`
     still describe product behavior more optimistically than the runtime
     actually guarantees.
   - Result: group the remaining behavior-sensitive fixes around lifecycle and
     profile-scoped ownership, instead of scattering them as plugin-local edge
     cases.

### Recommended High-only `fix-slop` batches
| Batch | Targets | High items covered | Batch intent |
| --- | --- | --- | --- |
| **D1 — Persisted state integrity** | `plugins/sero-kanban-plugin`, `plugins/sero-cron-plugin`, `plugins/sero-memory-plugin`, `plugins/sero-git-plugin`, `plugins/sero-web-plugin` | Fail-closed board/error-log/state snapshot reads; stop cross-plugin cron sync from treating corruption as empty/default state | Make malformed persisted state block mutation instead of being silently rewritten away. |
| **D2 — Canonical contract / bridge ownership** | `plugins/sero-admin-plugin`, `plugins/sero-git-plugin`, `plugins/sero-memory-plugin`, `plugins/sero-web-plugin` | Remove narrowed/local bridge contract copies and converge shared action/persisted contracts on neutral owners | Restore one truthful contract per host/plugin seam so cross-layer drift fails at compile time. |
| **D3 — Truthful UI→extension action ownership** | `plugins/sero-kanban-plugin`, `plugins/sero-web-plugin`, `plugins/sero-context-plugin` | Stop React-side mutation paths from bypassing extension-owned side effects or implying deterministic actions where only prompt-routed/manual behavior exists | Make the plugin UI surface truthful about who owns side effects and how actions really execute. |
| **D4 — Sero-first lifecycle + profile-home semantics** | `plugins/sero-cron-plugin`, `plugins/sero-memory-plugin`, `plugins/sero-context-plugin`, `plugins/sero-user-feedback-plugin`, `plugins/sero-web-plugin` | Startup recovery truthfulness, questionnaire/onboarding semantics, dashboard freshness claims, and `SERO_HOME`/agent-dir ownership | Align plugin runtime behavior with Sero’s actual lifecycle and profile-scoped state model. |

### Wave D target mapping note
- The plugin-specific checklist items in the tasklist should now be treated as
  **closeout markers**, not the execution order.
- A plugin is complete for Wave D only after all of its High findings are
  cleared across whichever of the D1–D4 batches it participates in.

## Wave E synthesis — 2026-04-14

### Cross-cutting themes across the remaining Medium findings
1. **Shared contract ownership is still the root dependency for the remaining Medium wave.**
   - `packages/common/src` and `packages/app-runtime/src` still own the most
     leverage-heavy Medium items: canonical model/provider contracts,
     data-first warning semantics, and the runtime truthfulness of
     `useAppState()`.
   - Result: do not start plugin-level bridge/type cleanups until the shared
     package owners are settled, or we will harden the wrong boundaries again.

2. **Residual desktop Electron Mediums are still architecture-setting seams, not leaf cleanup.**
   - `apps/desktop/electron/cli` and
     `apps/desktop/electron/features/kanban` both have mostly cap-pressure and
     ownership debt now, but they still sit on AD-020 bridging and
     host-side Kanban orchestration.
   - Result: clear those seam-level Mediums before broader plugin composition
     cleanup so downstream work inherits smaller, more truthful host patterns.

3. **Plugin Mediums cluster into repeatable concern groups, not package-by-package chores.**
   - Contract / bridge ownership and quality-gate drift: `sero-admin`,
     `sero-user-feedback`, plus the remaining extension-inclusive coverage work
     in `sero-web` and `sero-context`.
   - Runtime lifecycle / storage semantics: `sero-cron`, `sero-memory`,
     `sero-git`, `sero-context`, and `sero-kanban` still have single-owner
     truthfulness or helper-dedupe work after the High corruption/path fixes.
   - UI composition / cap-pressure relief: `sero-kanban`, `sero-admin`,
     `sero-git`, `sero-web`, `sero-user-feedback`, and parts of `sero-cron`
     still need module splits and direct component/runtime coverage.
   - Result: execute plugin Mediums by repeated concern so shared helper/test
     patterns can be reused across packages.

4. **Docs/help drift is real, but it should ship inside the owning behavior batch.**
   - The remaining doc-facing Medium work is attached to semantic cleanup:
     Kanban settings/help parity, cron `email` wording, user-feedback
     questionnaire expectations, and similar README/help updates.
   - Result: there is no standalone docs-only Medium batch; land copy/help
     updates in the same commits as the behavior or contract change they
     describe.

### Recommended Medium `fix-slop` batches
| Batch | Targets | Medium items covered | Batch intent |
| --- | --- | --- | --- |
| **E1 — Shared contract ownership + runtime reliability** | `packages/common/src`, `packages/app-runtime/src` | Split `model-selection.ts`, make warning payloads data-first, move provider-manifest typing into `@sero/common`, delete duplicate model contracts from `sero-bridge.ts`, and harden `useAppState()` lifecycle/write-failure behavior | Stabilize neutral shared owners and the core plugin-state hook before downstream bridge/UI cleanup. |
| **E2 — Residual desktop Electron seam relief** | `apps/desktop/electron/cli`, `apps/desktop/electron/features/kanban` | Split the near-cap AD-020 runtime/router hubs, extract one shared app-control host service, split Kanban workflow hubs, surface cleanup failures, and dedupe fallback/path helpers | Reduce cap pressure and ownership drift on the remaining architecture-setting Electron seams before plugin follow-up work. |
| **E3 — Plugin contract / bridge ownership + quality gates** | `plugins/sero-admin-plugin`, `plugins/sero-user-feedback-plugin`, `plugins/sero-web-plugin`, `plugins/sero-context-plugin` | Move admin `skill-visibility` ownership to a neutral home, canonicalize user-feedback transport/bus contracts, remove mirrored bridge subsets, and expand package-local typecheck/tests beyond UI-only coverage | Make host↔plugin contract drift fail fast and give the remaining Medium work trustworthy package-local safety nets. |
| **E4 — Plugin runtime lifecycle + storage semantics** | `plugins/sero-cron-plugin`, `plugins/sero-memory-plugin`, `plugins/sero-git-plugin`, `plugins/sero-context-plugin`, `plugins/sero-kanban-plugin` | Centralize reminder mutation rules, eliminate duplicate memory startup migration, move hot-path persistence/logging toward explicit async helpers, make Git `log`/`branches` repo-backed, dedupe Context projection logic, and surface Kanban cleanup failures | Finish the remaining truthful runtime-owner cleanup now that the High data-loss/home-path issues are closed. |
| **E5 — Plugin UI composition + cap-pressure relief** | `plugins/sero-kanban-plugin`, `plugins/sero-admin-plugin`, `plugins/sero-git-plugin`, `plugins/sero-web-plugin`, `plugins/sero-user-feedback-plugin`, `plugins/sero-cron-plugin` | Split near-cap UI/entrypoint hubs, add direct component coverage, remove dead scaffolding, and align user-facing settings/help surfaces after the contract/runtime batches stabilize | Lower review load on the heaviest plugin files and lock the post-High behavior in with direct tests. |

### Wave E target mapping note
- The tasklist should now treat the Wave E batch map above as the real Wave F
  execution order; the folder-level checkboxes are **closeout markers** only.
- `apps/desktop/electron/types` and `apps/desktop/electron/gateway` have no
  Medium findings, so they stay as no-op Wave F closeouts rather than forced
  churn.
- The same plugin can legitimately participate in multiple Medium batches.
  Close a plugin only after all of its remaining Medium findings are cleared
  across every batch it joins.
- Low items remain deferred to opportunistic cleanup or a dedicated polish pass.

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
1. Execute **E5 — Plugin UI composition + cap-pressure relief** for
   `plugins/sero-kanban-plugin`, `plugins/sero-admin-plugin`,
   `plugins/sero-git-plugin`, `plugins/sero-web-plugin`,
   `plugins/sero-user-feedback-plugin`, and `plugins/sero-cron-plugin`.
2. Treat `apps/desktop/electron/types` and `apps/desktop/electron/gateway` as
   no-op Medium closeouts unless real source or new findings appear.
3. Roll docs/help drift into the same commits as the owning behavior batch and
   run targeted validation plus monorepo `pnpm typecheck` after each batch.

Verification checklist for the Medium execution wave:
- `packages/common/src` and `packages/app-runtime/src` agree on canonical
  model/provider contracts and plugin-state behavior after E1.
- AD-020 CLI commands and host Kanban workflows still pass targeted smoke tests
  after the E2 seam splits/extractions.
- Plugin packages that expand their local quality gate now typecheck the
  relevant `extension/`, `shared/`, and `ui/` surfaces together.
- Cron reminder mutations, memory startup migration, Git read-only query
  freshness, Context projection output, and Kanban cleanup visibility remain
  truthful after E4.
- UI-heavy plugins still render and pass direct component/runtime coverage after
  E5, and monorepo `pnpm typecheck` stays green after every batch.

## Execution log
- `1486f968` — `refactor(common): split model contracts and provider manifests`
- `b145471f` — `refactor(app-runtime): harden shared state and widget runtime`
- `7c5a8456` — `refactor(app-runtime): remove boundary type escape hatches`
- `8d8f7648` — `refactor(cli): harden AD-020 bridge typing`
- `e09e6fad` — `fix(kanban): centralize shared contract and remove dead settings`
- `336b790a` — `fix(plugins): harden persisted state integrity`
- `d885ff2d` — `refactor(contracts): centralize plugin bridge ownership`
- `ff4e460a` — `fix(plugins): make web and context actions truthful`
- `a3f625be` — `fix(plugins): align profile-scoped path ownership`
- `aa301f95` — `fix(plugins): make lifecycle semantics sero-first`
- `a917905a` — `refactor(cli): split batch runtime and google router`
- `06b1b653` — `refactor(app-control): centralize host app control service`
- `8e1f9b7b` — `refactor(kanban): centralize cleanup and workspace path helpers`
- `e7e2e69c` — `refactor(kanban): split prompt and review workflow helpers`
- `181bd3cc` — `refactor(kanban): split orchestrator phase runners`
- `56ff5e59` — `refactor(plugins): harden E3 bridge ownership and quality gates`
- `cd40bbcb` — `test(web): cover history clearing and download cleanup`
- `86342e2a` — `refactor(plugins): land E4 runtime semantics batch`
