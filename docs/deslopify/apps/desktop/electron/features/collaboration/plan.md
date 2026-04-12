# Refactoring Plan — apps/desktop/electron/features/collaboration

_Plan drafted: 2026-04-12_

## Executive Summary
`electron/features/collaboration` is compact and readable, but it hides two meaningful runtime risks behind its small footprint: coordinator synthesis prompts can grow without a guardrail, and specialist failures are currently masked as placeholder text that still gets synthesized into a confident final answer. The follow-up work should stay conservative: add explicit degraded-mode behavior, cap/summarize prompt inputs, and deduplicate the repeated subagent execution scaffolding before this feature grows.

## Issues Found (prioritized)
- **Medium** — Final synthesis prompts are effectively unbounded — `apps/desktop/electron/features/collaboration/agents.ts:33-53`, `apps/desktop/electron/features/collaboration/index.ts:168-176`, and `apps/desktop/electron/features/collaboration/debate.ts:149-173,298` embed specialist outputs directly into coordinator prompts. Debate challenge context truncates some side-inputs (`debate.ts:127`), but the final synthesis stage still scales with full specialist output length. That is a real token/cost/runtime risk in an AD-021 fan-out feature. Effort: **M**.
- **Medium** — Specialist failures are converted into placeholder strings and then synthesized as if they were real analysis — `apps/desktop/electron/features/collaboration/index.ts:127,171-172` and `apps/desktop/electron/features/collaboration/debate.ts:239-242,149-173` feed `(Researcher failed to produce output)`, `(Analyst failed to produce output)`, and `(Agent failed)` straight into the final coordinator prompt. That hides degraded runs behind polished output instead of making failure explicit to callers/UI. Effort: **S**.
- **Low** — Collaboration and debate duplicate the same subagent execution scaffolding — `apps/desktop/electron/features/collaboration/index.ts:40-66` and `apps/desktop/electron/features/collaboration/debate.ts:48-82` both implement nearly identical role → agent-name lookup, `runSingleStructured()` invocation, duration timing, and error normalization. The duplication is small today but unnecessary drift pressure. Effort: **S**.
- **Low** — Required collaboration agent names are hardcoded with no preflight validation — `apps/desktop/electron/features/collaboration/agents.ts:13-27` binds runtime behavior to specific discovered agent names. If those names drift or the user removes a required agent definition, orchestration only fails mid-run. Effort: **S**.

## Proposed Refactoring
1. **Add explicit synthesis input budgeting.**
   - Introduce a small summarization/capping helper for specialist outputs before they are handed to the coordinator.
   - Keep the strongest signals (key findings, citations, disagreements), but enforce a predictable max size for the final synthesis prompt.
   - Align with AD-021's motivation: subagents should reduce main-context pollution, not recreate it one synthesis step later.

2. **Make degraded runs explicit instead of silently padded.**
   - Replace placeholder text injection with structured degraded-mode handling.
   - Options:
     - skip synthesis when required specialists fail and return a partial/error result, or
     - include an explicit `degradedReason`/`missingRoles` field in `CollaborationResult` and let the UI surface it.
   - Prefer truthful behavior over smooth-but-misleading prose.

3. **Extract a shared collaboration runner helper.**
   - Move the common “run one named specialist, measure duration, normalize errors, fire callbacks” logic into a local helper module shared by `index.ts` and `debate.ts`.
   - Keep debate-specific phase handling separate; only dedupe the repeated subagent invocation machinery.

4. **Add required-agent preflight validation.**
   - Before launching a collaboration run, verify that the required role-mapped agents are present.
   - Fail early with a clear missing-agent error instead of discovering the problem halfway through a multi-step run.
   - If agent-name migration is expected, support an alias/compatibility map rather than silently changing the canonical names.

## Benefits & Trade-offs
- Benefits: lower token burn during synthesis, more truthful failure reporting to the renderer, and less duplicated orchestration code.
- Trade-offs: any degraded-mode change is a behavior change for callers/UI, and prompt-capping needs careful tuning so quality does not drop unnecessarily.

## Dependencies & Risks
- Degraded-mode/result-shape changes may require coordinated updates in `apps/desktop/electron/ipc/collaboration/collaboration.ts` and any renderer consumers of collaboration results.
- Prompt-budgeting changes can alter answer quality; they need real scenario testing, not just type-safe refactoring.
- Required-agent validation depends on the team's willingness to treat those names as a supported compatibility contract.

## Next Steps
1. Add explicit synthesis prompt budgeting/capping.
2. Decide and implement degraded-mode behavior for missing/failed specialists.
3. Extract the shared single-specialist runner helper used by both collaboration strategies.
4. Add preflight validation for required collaboration agent names.
5. Verification checklist:
   - Run both collaboration modes with healthy specialists and confirm final answer quality stays acceptable.
   - Force one specialist to fail and confirm the result surfaces degradation explicitly.
   - Run a long-output scenario and verify final synthesis prompt size stays bounded.
   - Remove/rename one required collaboration agent and confirm the feature fails early with a clear error.
