# Protected Orchestrator changes

Baseline: `8c25462607750ea744348d8a59fdbc7fe2aca82b`

## `docs/guide/orchestrator.md`

- **Attention list:** The old text said that a Room can pause for more access
  or more members. The new text limits this statement to time and cost. Running
  membership and access increases are rejected. Evidence:
  `plugins/sero-orchestrator-plugin/runtime/rooms/room-revision-plan.ts`,
  `planRosterAddition()`, `planChangeConfiguration()`, and `planExpansion()`.
- **Manage a Room link:** The old link summary promised help with requests for
  more access. The new summary points to claims, limits, and supported team
  changes. Evidence:
  `plugins/sero-orchestrator-plugin/runtime/rooms/room-revision-plan.ts`.

## `docs/guide/rooms.md`

- **Team design:** The old text said that planning does not incur model costs.
  The new text says that planning can incur a cost before **Start**. It also
  says that member execution costs start only after **Start**.
  Evidence: `plugins/sero-orchestrator-plugin/runtime/rooms/planner.ts`,
  `planRoom()` and its `runStructuredJson()` call.
- **Changes record:** The old text said that the Conductor cannot increase
  access, time, cost, or team size beyond approved limits. The new text says
  that running access and membership increases are rejected, while higher time
  or cost limits can require approval. Evidence:
  `plugins/sero-orchestrator-plugin/runtime/rooms/room-revision-plan.ts`,
  `planRosterAddition()`, `planChangeConfiguration()`, and `planExpansion()`.

## `docs/guide/rooms-advanced.md`

- **Set access before start:** The old text described an approval flow for increased
  member access and grouped it with membership, time, cost, and delivery
  requests. The new text says that running access increases are rejected. It
  documents approval only for higher time or cost limits. Evidence:
  `plugins/sero-orchestrator-plugin/runtime/rooms/room-revision-plan.ts`,
  `planChangeConfiguration()` and `planExpansion()`.
- **Access caution:** The old text told users to review tools before they
  approved more access. The new text tells them to review tools before start
  because tools cannot be added during the run. Evidence:
  `plugins/sero-orchestrator-plugin/runtime/rooms/room-revision-plan.ts`,
  `planChangeConfiguration()`.
- **Running team changes:** The old text said that the Conductor can add or
  replace members within approved limits. The new text says that it can change
  work and can suspend, resume, or retire members, but cannot add or replace
  members after start. Evidence:
  `plugins/sero-orchestrator-plugin/runtime/rooms/room-revision-plan.ts`,
  `planRosterAddition()`, `planSuspend()`, `planResume()`, and `planRetire()`.
- **Pause and Stop:** The old text used the label **Cancel** for the terminal
  action. The new text uses the visible **Stop** label. It also says that Pause
  lets active turns finish and does not stop them, while Stop aborts them. Evidence:
  `plugins/sero-orchestrator-plugin/ui/components/RoomTopBar.tsx` and
  `plugins/sero-orchestrator-plugin/runtime/__tests__/room-lifecycle.test.ts`,
  tests `lets a running turn finish, then pauses and closes the sessions` and
  `cancels an in-flight turn and gives up the grant`.
- **Archive and Delete:** The old text described **Archive** and **Delete** UI controls and said
  that Delete leaves member sessions for normal retention. The new text says
  that neither control is exposed. It documents the `rooms` tool/API `delete`
  action and links GitHub issue #380. It says that Delete removes Room state and
  grant history, including member session files, after worktree preservation.
  The final caution now names only the available `delete` tool/API action.
  Evidence: `plugins/sero-orchestrator-plugin/runtime/rooms/room-app-actions.ts`,
  `plugins/sero-orchestrator-plugin/runtime/rooms/room-lifecycle.ts`,
  `deleteRoom()`, and
  `plugins/sero-orchestrator-plugin/runtime/__tests__/room-lifecycle.test.ts`,
  test `preserves live work and deletes grant history when the Room is deleted`.

## `docs/reference/workflows.md`

- **Tool actions:** The old list included unsupported `pause`, `resume`, and
  `stop` actions and omitted current actions. The new list follows the exported
  action schema. Evidence:
  `plugins/sero-orchestrator-plugin/extension/tools.ts`,
  `ORCHESTRATOR_ACTIONS`.
- **Run commands:** The old command block omitted `/orchestrator retry`. The new
  block includes it. Evidence:
  `plugins/sero-orchestrator-plugin/extension/commands.ts`, `HELP` and
  `parseCommand()`.
- **Library commands:** The old `library_save` syntax did not include its
  required mode, and the list omitted `library_delete`. The new commands match
  the parser. Evidence: `plugins/sero-orchestrator-plugin/extension/commands.ts`,
  `HELP` and `parseCommand()`.

## `docs/reference/rooms.md`

- **Member access:** The old text said that approved limits permit the
  Conductor to add members and that users can approve access or team-size
  increases. The new text says that running membership and access increases are
  rejected. It keeps the supported time and cost approval flow. Evidence:
  `plugins/sero-orchestrator-plugin/runtime/rooms/room-revision-plan.ts`.
- **Pause, cancel, and delete actions:** The old table did not distinguish
  settling a pause from aborting a Stop, and it described Delete only as record
  removal. The new table says that Pause lets active turns finish and does not
  stop them. It also states the Stop and session-history effects.
  Evidence:
  `plugins/sero-orchestrator-plugin/runtime/__tests__/room-lifecycle.test.ts`,
  tests `lets a running turn finish, then pauses and closes the sessions`,
  `cancels an in-flight turn and gives up the grant`, and
  `preserves live work and deletes grant history when the Room is deleted`.
- **Recovery and retention:** The old text presented Archive as a user action
  and said that Delete leaves member session files under normal retention. The
  new text distinguishes the internal archive state from the exposed actions
  and states that Delete removes grant history and member session files after
  work preservation. Evidence:
  `plugins/sero-orchestrator-plugin/runtime/rooms/room-store.ts`,
  `archiveRoom()` and `applyRetention()`;
  `plugins/sero-orchestrator-plugin/runtime/rooms/room-app-actions.ts`; and
  `plugins/sero-orchestrator-plugin/runtime/rooms/room-lifecycle.ts`,
  `deleteRoom()`.

## `docs/guide/scheduler-reminders.md`

- **Status paragraph:** Removed repeated beta framing. Kept the source-proven
  delivery limit.
- **Scheduler tabs paragraph:** Corrected the visible order to **Reminders**,
  **Jobs**, **Workflows**, and **History**. Kept the default tab and status-area
  flow. Evidence: `plugins/sero-cron-plugin/ui/components/CronTabs.tsx` and
  `plugins/sero-cron-plugin/ui/CronApp.tsx`.
- **Scheduled Workflows introduction:** Stated that Workflow cron schedules use
  UTC. Evidence: `plugins/sero-cron-plugin/ui/lib/orchestrator-loops.ts`.
## User-directed status wording

- **Guide index:** Removed repeated beta wording from three index entries and
  changed **Subagents and Collaboration** to **Subagents** because the
  Collaboration feature no longer exists. Routes and entry order did not
  change.
- **Reference index:** Replaced **beta guidance** with **compatibility
  guidance** in the Plugins entry. The route and entry order did not change.
- **Workflow and Room tutorials:** Removed the generic beta caution from each
  introduction. No task step, example, link, or media reference changed.
