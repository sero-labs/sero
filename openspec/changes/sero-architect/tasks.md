## 1. Early interactive prototype and user review

This is the first apply-stage deliverable. Complete the prototype and present it for review before production implementation. Section 2 is environment preparation and can proceed when it does not interrupt the review. Sections 3 onward require the approval recorded in task 1.7.

- [ ] 1.1 Use `sero-prototype` to inspect current Sero entry points, design tokens, shared controls, the closest existing prototypes, and `PrototypeArchive.tsx`; verify a short review brief identifies source references, the minimal-state requirement, and the two-way steering questions without designing the game.
- [ ] 1.2 Build a standalone interactive Architect prototype under `apps/styleguide/public/prototypes/` and add its archive entry; verify the archive opens it through the styleguide server without external runtime dependencies.
- [ ] 1.3 Add initial idea, working, required-input, blocked, pausing/paused, result-review, and maintenance states; verify each state makes current status, needed input, and available direction clear without a routine event feed or empty panels.
- [ ] 1.4 Add explanation, direction-change acknowledgement, decision resolution, pause/resume, result access, history, and targeted detail interactions; verify mouse and keyboard behavior and that illustrative content never becomes a fixed game brief.
- [ ] 1.5 Serve the prototype and use `agent-browser` to check the archive link, focus order, Escape behavior, viewport fit, and text clipping at two desktop sizes; verify an accessibility audit and manually resolve incomplete findings, then save decision-critical captures in the prototype screenshots directory.
- [ ] 1.6 Run `pnpm --filter @sero/styleguide build` and `git diff --check`; verify both pass and present the served route, captures, tested interactions, and unresolved design choices.
- [ ] 1.7 Obtain the user's explicit approval of the prototype direction and record the review evidence in the change or linked issue/PR; verify approval covers the latest reviewed revision, leaving this task unchecked until that answer arrives.

## 2. Dedicated clean Sero profile

- [ ] 2.1 Ask the user to manually create a dedicated clean Sero profile, recommend leaving profile-copy disabled, and request its storage location. Wait for their reply; verify the supplied location matches a registered profile with a separate data root before marking this task complete. Do not create the profile or select its location on their behalf.
- [ ] 2.2 Ask the user to activate that profile and complete any required provider/model onboarding, coordinating the restart with active work; verify the active profile resolves to the supplied location and a basic model request works. Record the effective tool/plugin inventory without secret values, and confirm any credential/preference transfer was a deliberate user choice.
- [ ] 2.3 Prepare fresh live-test workspaces and inspect the initial context and state; verify old sessions, memory, schedules, graph indexes, and workspace `.sero/apps/` history are absent, while machine-shared toolchains remain reusable. Record this baseline before any live Architect run.

## 3. Reconcile the reviewed design and host contracts

- [ ] 3.1 Update proposal, design, specs, and downstream tasks from the approved prototype; verify `openspec validate sero-architect --strict` passes and the approved interaction states map to requirements without prescribing the trial product.
- [ ] 3.2 Trace and specify the smallest host binding for a profile-level Orchestrator project coordinator and pre-workspace owner session; verify an implementation map covers profile startup/disposal, workspace creation/binding authority, and single-owner identity. If the approach cannot retain the agreed workflows, obtain a scope decision before implementing it.
- [ ] 3.3 Map effective discovery, browser, verification, dev-server, Memory, Graphify, model, and plugin access for owner and worker sessions; verify each operation has an existing authorized route or a narrowly defined host contract, including the current fixed Room-grant limitation.
- [ ] 3.4 Map the required renderer/store, preload, IPC, Pi SDK, and generic CLI changes; verify all changed contracts have a canonical type owner and that programmatic tool calling retains the calling session's authority.

## 4. Project records and owner lifecycle

- [ ] 4.1 Add typed, versioned project and index records through host app-state, with artifact references and serialized project mutations; verify focused persistence tests cover reload, failed writes, and concurrent revision updates without a second transcript store.
- [ ] 4.2 Add seed, requirement, decision, assumption, and evidence provenance with supersession; verify the original input survives revisions unchanged and Architect-authored choices cannot be relabeled as user requirements by a normal update.
- [ ] 4.3 Bind the project coordinator once per profile and add authorized workspace references; verify view closure does not cancel work, duplicate mounts do not create owners, and profile switching does not adopt another profile's pending work.
- [ ] 4.4 Create and reopen the standard managed owner session in its authorized context; verify a project can start before product-workspace binding and can later attach workspaces without gaining arbitrary path access.
- [ ] 4.5 Build owner context from current records and relevant artifact references, including after compaction; verify stale memory and superseded decisions cannot replace current requirements in the assembled assignment context.
- [ ] 4.6 Add the owner's investigation and project-update commands with bounded research purposes and stopping conditions; verify a focused scripted owner can record evidence, revise its plan, and choose a next action while rejecting stale or unauthorized mutations.

## 5. Direction and the reviewed production interface

- [ ] 5.1 Persist incoming messages and direction application state through the canonical bridge; verify saving failure is visible and a received message is not reported as applied direction before its project update succeeds.
- [ ] 5.2 Add revision-aware direction handling and explicit pause/resume/stop actions; verify affected dispatch is held, unchanged work remains eligible, pausing is distinct from paused, and resume reconciles newer instructions.
- [ ] 5.3 Add attention records and resolution using existing generic action paths; verify consequential requests identify their recommendation, consequence, and blocking scope, and resolved questions are not reissued without a new reason.
- [ ] 5.4 Implement the approved compact Architect view and direction entry with Zustand and existing host persistence; verify component tests cover working, applying direction, blocked, limited, paused, result, and maintenance states without default event feeds or hidden material failures.
- [ ] 5.5 Add on-demand paged conversation history, artifact access, and specific Orchestrator detail navigation; verify opening detail has no project side effect and returning retains the current project context.
- [ ] 5.6 Add the reviewed entry points through existing dashboard, Board, and web-remote contracts; verify they resolve the same project state and attention without creating duplicate controls or a separate remote state authority.

## 6. Connected execution and recovery

- [ ] 6.1 Add a focused-agent dispatch/observe/control adapter carrying project, work, command, workspace, and revision identities; verify a persisted intent resolves to one execution after a lost acknowledgement.
- [ ] 6.2 Connect Workflow execution and outcomes through the same narrow project boundary; verify a completed or failed run returns to project ownership and preserves the workflow's own detail and independent controls.
- [ ] 6.3 Connect Room execution, outcomes, and supported handover behavior; verify the project does not widen a running Room grant and keeps artifacts when a different authorized execution must continue the work.
- [ ] 6.4 Connect supported Goal-driven chat work while preserving exact-session driver arbitration; verify a competing driver is refused, ordinary user input still works, and Goal waiting is not treated as automatic project wake support.
- [ ] 6.5 Implement the required managed-session capability loading and host action contracts identified in section 3; verify an installed-but-ungranted plugin stays unavailable, tool origins remain checked, and runtime failure does not fall back to Host.
- [ ] 6.6 Propagate direction to affected running executors at supported boundaries and retain old-revision results; verify late results cannot advance current acceptance without reassessment and unaffected work can continue.
- [ ] 6.7 Add bounded budget reservation and observed usage aggregation across owner and child work; verify concurrent allocations cannot spend the same remainder, repeated usage is counted once, and delayed external usage remains identified as incomplete.
- [ ] 6.8 Add relevant event wakes, persistent pending-action identities, and restart reconciliation; verify duplicate signals produce one logical action, waiting does not call a model for status, and interrupted dispatch or delivery is reconciled before retry.
- [ ] 6.9 Add feature disablement and profile-disposal handling; verify new work stops, active work is reconciled or reported, unrelated modes remain intact, and transcripts, artifacts, worktrees, and uncommitted changes are preserved.

## 7. Acceptance and confirmed delivery

- [ ] 7.1 Add revisioned acceptance criteria and evidence records with origin, checked artifact, method, result, producer, and time; verify false completion reports and missing required checks cannot produce accepted status.
- [ ] 7.2 Connect host verification and browser evidence to criteria and revision references; verify a passing command or existing PR cannot substitute for unrelated behavior checks, and unavailable required observation remains unverified.
- [ ] 7.3 Add invalidation of evidence affected by changed requirements or artifacts; verify an old result cannot establish acceptance of the new candidate and explicit user requirement changes retain their history.
- [ ] 7.4 Add release intent, accepted-revision binding, and observed delivery through the selected authorized tool path; verify changed candidates require reassessment and failed delivery retains the accepted result with an accurate next action.
- [ ] 7.5 Add interrupted-delivery reconciliation against available destination reads; verify lost acknowledgements do not cause blind repeated writes and unresolved external effects remain visible for resolution.
- [ ] 7.6 Add focused human result-review requests where criteria require judgment; verify the review opens the relevant result and stores feedback as direction or a decision without treating automated success as human acceptance.

## 8. Bounded maintenance

- [ ] 8.1 Persist maintenance responsibilities, authorized changes, trigger references, and budget with the release; verify restart preserves the handoff and no new mandate is inferred solely from successful delivery.
- [ ] 8.2 Connect relevant existing schedule and event sources to project work; verify duplicate reports attach to one unresolved item, unrelated events do not dispatch work, and no-change checks return to quiet monitoring.
- [ ] 8.3 Route maintenance corrections through the same direction, evidence, and delivery path; verify an out-of-mandate change requests a decision while an authorized correction can produce a newly verified release.

## 9. Integrated checks and the live ownership trial

- [ ] 9.1 Run the closest existing tests for each touched runtime, host, and UI area plus the added behavior tests; verify contracts across profiles, sessions, steering, grants, budgets, acceptance, and recovery before a paid live run.
- [ ] 9.2 Validate the implemented interface against the approved prototype through the served app at two desktop sizes; verify mouse/keyboard behavior, accessibility, truthful state, minimal content, and specific detail links with persistent rendered evidence.
- [ ] 9.3 In the dedicated clean profile, launch the exact seed from design D10 with only the established Architect instructions and operating authority; verify no evaluator-authored game design or prototype content is added, and record actual research, decisions, execution, and review evidence.
- [ ] 9.4 Let Architect take the project through verified delivery using the target selected during the run; verify the actual deployed or delivered artifact against the original requirements and Architect's recorded commitments, and record human judgment separately.
- [ ] 9.5 Exercise user redirection while work is active and an interrupted execution, using a further recorded run if needed; verify acknowledged direction changes affected work, late results do not bypass current acceptance, and recovery does not require manual context transfer.
- [ ] 9.6 Exercise an unavailable capability and a reproducible maintenance defect with a duplicate event; verify honest blockage or authorized recovery, one logical correction, regression evidence, confirmed delivery, and return to monitoring. Label any controlled defect injection and retain prior evidence.
- [ ] 9.7 Report deterministic checks, rendered checks, live outcomes, interventions and reasons, duplicate effects, known cost, and remaining limitations separately; verify the user can review whether Architect owned the cycle without grading a prescribed creative direction or claiming broader reliability than tested.

## 10. Documentation and delivery

- [ ] 10.1 Write user guidance in `apps/docs-site/docs/` for starting, directing, pausing, reviewing, and maintaining an Architect project; verify examples and screenshots against the implemented app, including the actual profile and host-availability limits.
- [ ] 10.2 Update the owning README and `ARCHITECTURE.md` with implemented boundaries only; verify linked paths and contracts match the shipped code and that packages needing publication are identified.
- [ ] 10.3 Run the applicable React Doctor workflow for production React changes, root `pnpm typecheck` before any commit, and `git diff --check`; verify checks pass, source files stay within 500 LOC, and unrelated changes are preserved. Use Conventional Commits and keep any PR a draft unless the user requests otherwise.
