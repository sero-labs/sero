## 1. Prototype and profile

- [x] 1.1 Build the Architect UI prototype under `apps/styleguide/public/prototypes/sero-architect/` with the states intake, discovery running, charter awaiting approval, building quietly, decision required, limited, maintain, and the projects list; link it from `PrototypeArchive.tsx`; verify it serves from the styleguide Vite URL at two viewport sizes and `pnpm --filter @sero/styleguide build` passes
- [x] 1.2 Screenshot every prototype state at real size into `prototypes/screenshots/sero-architect/` and get the user's sign-off on the four-part page and the decision card; verify the sign-off is recorded in the pull request description
- [ ] 1.3 Ask the user to create a clean profile by hand and give its path; verify the path is recorded in the pull request description and the source checkout is active under Local Plugin Development in that profile

## 2. Host seams

- [x] 2.1 Add `architect: 'sero-architect-plugin'` to the persistent-session built-in allowlist; verify the gate tests cover the bundled path accepted and a copy at another path denied with `package-path-mismatch`
- [x] 2.2 Add workspace create to the app-runtime workspace API, the typed `SeroBridge`, the preload and the main-process handler together; verify a unit test proves the home-directory guard and the missing-capability refusal, and `pnpm typecheck` passes
- [x] 2.3 Verify by a main-process test that a workspace created through the bridge runs the `workspace.create.option` contributions and emits the workspace-changed push
- [x] 2.4 Add `create` to `OrchestratorBoardAction` with the loop id in the result, and type the Room registry entry with a `create` action in `@sero-ai/common`; verify tests show a Workflow created through the handle takes the same planner and limits path as the `orchestrator` tool, a Room created through the handle shows the grant prompt, and a missing coordinator fails by name
- [x] 2.5 Check whether a `runStructured` subagent run can reach the CLI browser screenshot tool; verify the answer and the chosen capture path (verifier run or dispatched Workflow verification step) are recorded in the pull request description before task 6.2 starts

## 3. Plugin skeleton and record

- [x] 3.1 Create `plugins/sero-architect-plugin/` from the sero-plugin skill's notes example with app id `architect`, global scope, runtime, extension, shared and ui, a unique dev port, `runtimeAbi: 3`, `styleIsolation: scope`, and `requiredHostCapabilities` limited to `appAgent.invokeTool`, `tool.cli`, `appRuntime.background`; verify `pnpm install`, plugin `typecheck` and `build` pass and the app appears in the sidebar
- [x] 3.2 Define the project record, index and lifecycle types in `shared/` with `SERO_ARCHITECT` kill switch handling; verify unit tests cover every phase transition, overlay rule and the charter-approval gate
- [x] 3.3 Implement the record store under `<SERO_HOME>/apps/architect/` with atomic writes, the watched index and a single writer; verify tests prove an interrupted write leaves the previous record readable and the index updates in the same operation
- [x] 3.4 Implement restart reconciliation; verify a test shows an over-budget project comes back `limited` and no wake is issued before reconcile completes

## 4. Owner session and tools

- [x] 4.1 Register the `architect` bridged tool with actions brief, charter, milestone, decide, research, dispatch, evidence, status, reply, blocked and sleep, each carrying the project id and refusing a foreign id; verify tests cover shape validation for decisions (recommendation and consequences required), the charter-already-approved path that records a decision instead, and an evidence call that carries an exit code or capture being refused
- [x] 4.2 Register the `architect_projects` management tool with create, pause, resume, stop, raise cap, set autonomy, answer, directive and delete; verify `sero help architect_projects` lists them and tests cover pause not cancelling dispatches
- [x] 4.3 Build the contract message from the record with the Goal precedent (supersedes earlier contracts, idea and directives as task data, keep-working only without overlay); verify snapshot tests for every phase and overlay and that an instruction inside the idea is quoted, not obeyed
- [x] 4.4 Open the owner session from a clamped grant proposal naming only the platform tools and `sero-cli`, and re-send the contract after compaction; verify an e2e test on the built Electron main shows the grant prompt, the session opening against a workspace created seconds earlier, the contract arriving on the first turn, and the logged command list holding the Architect commands, `workspace` and `pwd` and no command from another app
- [x] 4.5 Implement the wake scheduler with the six sources, the priority order, one wake at a time and coalescing during a turn, fed by app-state watches on the linked Orchestrator loop and Room index files; verify tests prove a directive outranks a completion and two completions during a turn become one wake
- [x] 4.6 Implement the explicit-outcome rule: a turn ending without sleep, decide, blocked or status-then-sleep counts as no progress and three such turns block the project; verify a test drives three silent turns and observes `blocked`

## 5. Lifecycle, decisions and budget

- [x] 5.1 Implement intake: idea plus folder, folder creation, `git init`, workspace registration through the new bridge, then the grant; verify an e2e test creates a project from a folder and lands in `discovery` after approval
- [x] 5.2 Implement discovery and charter: the research action running `host.subagents.runStructured` with a question and stopping condition and attaching the result, then brief, milestones, escalation policy, autonomy setting defaulting to `milestones`, cost cap required, user approval gate; verify tests show a research result on the record before the next wake, refuse a charter without a cap, and hold the phase without approval
- [x] 5.3 Implement decisions and parking: shape validation, parked milestones, no timeout or default, forced escalations for charter change, external delivery and over-cap spend, answer with note waking the owner first; verify tests cover each forced escalation and an independent milestone continuing while another is parked
- [x] 5.4 Implement directives and replies with the reply required before the wake ends; verify a test shows a directive during a running Workflow produces a reply and leaves the Workflow running
- [x] 5.5 Implement budget accounting from owner turns, subagent runs and linked index usage, the `limited` overlay, and raise-to-resume; verify tests cover cap reached mid-run with the Workflow continuing and cap raised clearing the overlay

## 6. Build loop and verification gate

- [x] 6.1 Implement the dispatch action: the runtime creates and activates the Workflow or Room through the typed registry handles from task 2.4, links the id to the milestone, and applies the completion-is-a-claim rule that moves a milestone to `verifying`; verify a test drives a dispatched Workflow to complete and observes `verifying`, not `done`, and that the owner session never held a Workflow or Room tool
- [x] 6.2 Implement the verification gate as runtime-run evidence: commands through host verification with exit codes and output, diff summary from git for file changes, dev-server smoke check and capture for preview milestones through the path chosen in task 2.5, each item stamped with the checked commit, and the four states reported, verified, accepted and delivered kept distinct; verify tests refuse a done request with each missing item and with a non-zero exit code, mark evidence stale after a file change and rerun it, and show a receipt without verification leaving the milestone in `verifying`
- [x] 6.3 Implement release through the existing PR or workspace-files delivery with external destinations forced to a decision; verify a test shows an external destination raises a decision before any send
- [ ] 6.4 Implement maintain: a maintenance Workflow subscribed to GitHub issue, CI-failed and scheduled sources whose completions wake the owner to triage; verify an e2e test on the built Electron main files an issue and observes a triage wake and a dispatch or decision

## 7. Production UI

- [x] 7.1 Build the projects list and project page from the signed-off prototype with the four parts, disclosures for history, evidence and older directives, no event log and no streaming; verify a screenshot check against the prototype at the same size and React Doctor passes
- [x] 7.2 Build the decision card with the recommendation preselected and one-action answer, the milestone rail with one Orchestrator link per dispatched milestone, and the directive composer; verify UI tests cover answering in one action and the link opening the Orchestrator record
- [x] 7.3 Build the controls (pause, resume, stop, raise cap, change autonomy, open session, delete) and persist layout preferences through the host layout service; verify a test shows collapsed history survives a restart and a grep finds no `localStorage`
- [x] 7.4 Build the dashboard widget from the shared dashboard components reading only the index; verify it appears in Add Widget, shows the needs-you count, and shows the empty state with one create action

## 8. Proving run and docs

- [ ] 8.1 Run the proving project in the clean profile with the roguelike spec as the verbatim intake and the default autonomy; verify a charter with a cost cap is presented for approval and at least one decision is raised with a recommendation
- [ ] 8.2 Continue the proving run through two milestones; verify each closes only with recorded command results and a capture, and the total spend stays under the approved cap
- [ ] 8.3 Continue through release and maintain; verify one filed issue produces a triage wake and a fix delivered through the PR path with a receipt
- [x] 8.4 Write the user guide and reference pages under `apps/docs-site/docs/`, add the Architect row to the Orchestrator mode table, and remove kanban and plan-mode from the recommended catalog list; verify the docs-site build passes and every internal link resolves
- [ ] 8.5 Route a code review at high effort and fix the findings; verify `pnpm typecheck`, plugin tests and the e2e specs pass on the final branch
