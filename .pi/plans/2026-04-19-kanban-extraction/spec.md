# Kanban Plugin Self-Containment Migration

**Date:** 2026-04-19
**Status:** Draft
**Directory:** /Users/danielcarter/Documents/Dev/projects/sero/sero

## Intent
Make Kanban truthfully plugin-owned in Sero. The Kanban board already lives largely inside `plugins/sero-kanban-plugin`, but the runtime behavior that makes it functional still depends on Kanban-specific host logic in `apps/desktop`. This migration defines an end state where Kanban-specific workflow policy, automation semantics, and review actions belong to the plugin, while the desktop shell retains only generic platform/runtime primitives.

## Problem Statement
Kanban is currently split across two ownership domains:
- the plugin owns the board UI, widget, extension tool surface, prompts, and shared state/settings contract;
- the desktop host still owns the Kanban workflow engine, including state-file watching, orchestration, phase runners, worktree and PR lifecycle, preview/dev-server management, cleanup, and recovery.

That split makes Kanban only partially plugin-owned. It leaves core Kanban behavior in the shell, increases coupling between the plugin and `apps/desktop`, makes the shell carry domain-specific business logic, and weakens the long-term goal of installable/self-contained plugins.

The migration should correct the ownership boundary so that Kanban behavior is defined by the Kanban plugin, not by the desktop shell, without regressing the automation and recovery behavior that users rely on.

## Desired End State
Kanban becomes a fully plugin-owned feature in terms of business logic and runtime semantics.

In the desired end state:
- `plugins/sero-kanban-plugin` owns the canonical Kanban workflow semantics;
- `plugins/sero-kanban-plugin` owns planning, implementation, and review phase behavior definitions;
- `plugins/sero-kanban-plugin` owns review action semantics such as `request-revisions` and `cancel-pr`;
- `apps/desktop` retains only generic platform/runtime primitives such as app-state transport, file watching, workspace execution, container access, subagent execution, generic app-tool bridging, and bootstrap wiring;
- no Kanban-specific business logic remains in `apps/desktop`;
- the Kanban feature remains automation-driven, including auto-start, startup recovery, review cleanup, PR cancellation behavior, auto-merge behavior, preview/dev-server handling, and cleanup/retry semantics;
- the resulting ownership model is suitable for external/installable plugin readiness, even if the planner chooses an incremental path to get there.

## User Story
As a Sero user and platform maintainer, I want Kanban to be owned by `sero-kanban-plugin` rather than the desktop shell, so that the plugin is the truthful source of Kanban behavior, the shell stays generic, and Kanban can evolve toward installable/self-contained plugin ownership without losing its current automation.

## Behavior
The migrated Kanban feature should continue to behave like today from a workflow perspective, while changing who owns the behavior.

### Happy Path
1. A user interacts with the Kanban board through the Kanban plugin UI.
2. A card transition or Kanban action triggers Kanban-owned workflow semantics.
3. The Kanban plugin determines what workflow behavior should occur next.
4. Generic host/runtime primitives execute the requested workspace, container, subagent, file, preview, or git/PR operations.
5. The board continues to auto-progress through planning, implementation, review, and completion behavior using plugin-owned semantics.
6. Review actions such as requesting revisions or cancelling a PR are interpreted as Kanban plugin actions rather than shell-owned Kanban effects.
7. The user-visible board behavior, automation, cleanup, and recovery remain consistent with the current feature.

### Edge Cases & Error Handling
- **Interrupted work at startup:** cards interrupted during execution are still recovered automatically.
- **Review cleanup failures:** cleanup remains best-effort but failures remain visible.
- **PR cancellation:** cancelling a PR still produces the same user-visible workflow outcome as today.
- **Auto-merge flows:** when Kanban settings enable auto-merge, that behavior still occurs.
- **Preview/dev-server lifecycle:** preview startup, reuse, and cleanup behavior still occurs automatically for Kanban runs.
- **Retries and cleanup:** retry/recovery semantics continue to match the current Kanban automation contract.
- **On-disk contract changes:** if the planner changes `.sero/apps/kanban/*`, no compatibility guarantee for unreleased pre-migration data is required; a fresh-start contract is acceptable.

## Scope
### In Scope
- Defining `sero-kanban-plugin` as the canonical owner of Kanban workflow semantics.
- Moving Kanban-specific planning, implementation, review, and review-action policy out of `apps/desktop`.
- Removing Kanban-specific business logic from the desktop shell.
- Preserving current automatic runtime behavior while changing ownership.
- Preserving user-visible Kanban outcomes for auto-start, startup recovery, review cleanup, PR cancellation, auto-merge, preview/dev-server handling, and cleanup/retry behavior.
- Ensuring Kanban uses generic host seams rather than bespoke Kanban-only shell glue.
- Treating external/installable-plugin readiness as a desired end-state property.
- Allowing a fresh-start state contract if the planner decides a file-contract change is necessary.

### Out of Scope
- Rewriting or replacing generic host/platform primitives such as `appStateManager`, workspace/container/subagent infrastructure, or shared bootstrap.
- Defining the exact implementation architecture, API shape, module layout, or migration sequence.
- Broad refactors of unrelated desktop or plugin systems.
- Preserving compatibility for unreleased pre-migration Kanban board/worktree/review data.
- Product redesign of Kanban UX beyond ownership and behavior-preservation needs.

## Ownership Boundary
### Plugin-Owned
The Kanban plugin should own:
- canonical Kanban workflow semantics;
- Kanban card transition policy;
- Kanban planning-phase behavior definitions;
- Kanban implementation-phase behavior definitions;
- Kanban review-phase behavior definitions;
- review action semantics, including `request-revisions` and `cancel-pr`;
- Kanban-specific state-shaping and action meaning wherever those are domain behaviors rather than generic transport.

### Host-Owned
The desktop shell should own only generic capabilities reusable by any plugin, including:
- app-state transport and persistence primitives;
- generic file watching and change notification;
- workspace and container execution infrastructure;
- subagent execution infrastructure;
- generic app-tool/action invocation bridges;
- shared bootstrap and runtime wiring.

### Explicit Boundary Rule
If logic exists only because the feature is Kanban, it belongs to the plugin. If logic exists because the Sero platform must provide a generic execution/runtime primitive to any plugin, it belongs to the host.

## Preserved Invariants / Behavior Contracts
The following are hard invariants for the migrated end state:
- Ready cards still auto-start without manual invocation.
- Startup still recovers cards interrupted during execution.
- Review cleanup still runs automatically after review transitions.
- PR cancellation still produces the current user-visible outcome.
- Auto-merge still functions when Kanban settings enable it.
- Preview/dev-server handling still occurs automatically for Kanban runs.
- Cleanup and retry behavior still matches current Kanban automation.
- Cleanup failures remain visible instead of being silently swallowed.
- Workspace and profile isolation remain intact.
- Generic host seams remain generic and do not become Kanban-branded runtime surfaces.
- The plugin becomes the truthful owner of Kanban behavior even when generic host primitives perform execution on its behalf.

## Success Criteria
### User-Visible Success
- Kanban continues to auto-progress work without requiring new manual steps.
- Recovery behavior still protects interrupted work on startup.
- Review actions still behave as users expect today.
- PR and preview/dev-server flows still feel like the current Kanban feature.
- Users do not experience Kanban as a partially host-owned feature anymore.

### Architecture-Level Success
- Kanban-specific workflow policy no longer lives in `apps/desktop`.
- Kanban-specific review-action policy no longer lives in `apps/desktop`.
- No Kanban-specific orchestration engine remains in `apps/desktop`.
- No new Kanban-only platform primitive is added to the shell.
- Kanban runtime behavior is expressed through plugin-owned semantics and generic host execution seams.
- The resulting design supports external/installable plugin ownership rather than a permanently built-in-only model.

## Effort & Quality
- **Level:** production
- **Tests:** thorough
- **Docs:** README

## Constraints & Dependencies
- The shell must keep generic runtime primitives available for workspace, container, subagent, git/PR, preview, and app-state execution.
- The planner may use the Google migration as a pattern for ownership extraction, but Kanban does not need to match Google exactly if Kanban has different runtime constraints.
- The migration must preserve current behavior contracts even if the underlying on-disk contract or execution path changes.
- The spec intentionally allows a fresh-start state/data contract because Sero has not shipped yet.
- This spec defines ownership and behavior intent, not the mechanism used to realize that ownership.

## Deferred to Planner
These are deliberately left as HOW decisions rather than unresolved WHAT questions:
- the exact generic host capability surface the plugin will call into;
- whether any temporary adapter layer is needed during cutover;
- the exact shape of any new or revised `.sero/apps/kanban/*` contract;
- the precise packaging steps needed to satisfy external/installable-plugin readiness.

## Ideal State Criteria

### Core Functionality
- [ ] ISC-1: `sero-kanban-plugin` owns the canonical Kanban workflow semantics.
- [ ] ISC-2: `sero-kanban-plugin` owns planning-phase Kanban behavior definitions.
- [ ] ISC-3: `sero-kanban-plugin` owns implementation-phase Kanban behavior definitions.
- [ ] ISC-4: `sero-kanban-plugin` owns review-phase Kanban behavior definitions.
- [ ] ISC-5: `sero-kanban-plugin` owns `request-revisions` action semantics.
- [ ] ISC-6: `sero-kanban-plugin` owns `cancel-pr` action semantics.
- [ ] ISC-7: Ready cards still auto-start without manual invocation.
- [ ] ISC-8: Startup still recovers cards interrupted during execution.
- [ ] ISC-9: Review cleanup still runs automatically after review transitions.
- [ ] ISC-10: PR cancellation still produces the current user-visible outcome.
- [ ] ISC-11: Auto-merge still functions when Kanban settings enable it.
- [ ] ISC-12: Preview/dev-server handling still occurs automatically for Kanban runs.
- [ ] ISC-13: Cleanup and retry behavior still matches current Kanban automation.

### Architecture Boundaries
- [ ] ISC-14: Workspace and container infrastructure remain generic host-owned primitives.
- [ ] ISC-15: Subagent execution infrastructure remains generic host-owned primitives.
- [ ] ISC-16: App-state transport and file-watching infrastructure remain generic host-owned primitives.
- [ ] ISC-17: Kanban-specific workflow policy no longer lives in `apps/desktop`.
- [ ] ISC-18: Kanban-specific review-action policy no longer lives in `apps/desktop`.
- [ ] ISC-19: Kanban runtime uses generic host seams instead of bespoke shell glue.
- [ ] ISC-20: The resulting Kanban runtime is compatible with external plugin ownership.

### Quality
- [ ] ISC-21: Thorough tests cover happy paths, recovery, and error handling.
- [ ] ISC-22: README documents setup and plugin-owned runtime expectations.
- [ ] ISC-23: Cleanup failures remain visible instead of being silently swallowed.

### Anti-Criteria
- [ ] ISC-A-1: No Kanban-specific orchestration engine remains in `apps/desktop`.
- [ ] ISC-A-2: No new Kanban-only platform primitive is added to the shell.
- [ ] ISC-A-3: No compatibility requirement exists for unreleased pre-migration Kanban data.
