## Why

A person cannot tell from the Architect projects list, Orchestrator Home, the Workflows tab, the Rooms list or the workspace tree whether work is happening, whose work it is, or whether it needs them. The audit found three faults behind that. State is a coloured dot with no word. The Architect's one-line state is free text its own model wrote, so a project read "Working on M2" for three days after that Workflow had stopped. Home reads "0 active" above a Workflow the Workflows tab labels "Active".

This is issue #536, the first of eight approved proposals from the agent and workspace UX audit. The approved design is `apps/styleguide/public/prototypes/agent-workspace-ux-audit/1-activity-at-a-glance.html`.

## What Changes

- **One state vocabulary** in `@sero-ai/common`: working, queued, waiting for a trigger, waiting for you, paused, idle, complete, stopped, last known. Each is a word, a glyph with its own shape, and one sentence about what happens next. No state depends on colour or motion.
- **Derived activity, not a written sentence.** The Architect index entry gains a structured activity line built from the project record and the watched Orchestrator index: the state that matters, and a second line naming whose it is, Architect's or the Workflow or Room it handed work to. The model's own sentence moves into the project page under "What Architect reported". **BREAKING** for readers of `ArchitectIndexEntry.stateLine`: the Architect UI and its dashboard widget stop rendering it as the state.
- **Working only from an observed report.** The Architect marks a dispatch live only while its own runtime is running and has observed that run report in this Sero session. Otherwise the row reads Last known with the saved time. No timer, no invented progress.
- **Architect not running** is said once at the top of the list as text with no dismiss. Rows that would need a live report read Last known. Stopped, paused and complete stay as saved.
- **Needs you · N** filter on the projects list, showing only the rows that need the user.
- **Project header** leads with the state in plain words, the same activity line as the list, and one button only when something needs the user. Retry step is lifted from the milestone to the header when a stopped step is what needs the user.
- **Pausing a project disarms its maintenance Workflow** and resuming re-arms exactly the triggers the pause disarmed. In-flight Workflows and Rooms still continue, which the existing pause guarantee requires.
- **One definition of active.** Orchestrator Home and the Workflows tab both read the shared vocabulary. Home opens on a status line and the work that needs the user; the three explainer cards become Workflow, Room and Goal buttons plus one "What are these?" disclosure; several suggested changes to one Workflow group under its name.
- **Workflows tab becomes a full-width list** and a row opens the Workflow on its own routed page with a "← Workflows" link. The side-by-side detail pane and its "Select a Workflow from the list." are removed. The page shows the detail content it shows today; its own redesign belongs to #537, #538 and #541, which stack on this route.
- **Rooms rows** say in words that a Room waits on the user and for how long. The brief leaves the row and stays complete inside the Room. Rows keep their member avatars.
- **Workspace tree** shows one small icon beside a workspace's name when something in it needs the user or has stopped, with the words on hover and focus.

## Capabilities

### New Capabilities

- `activity-state`: the shared state vocabulary, how each state is derived from records, and the rule that every state reads as a word and a distinct glyph without colour or motion.
- `orchestrator-ui`: what Orchestrator Home, the Workflows tab and the Rooms list show, and that a Workflow opens on its own page.
- `workspace-attention`: the one icon on a workspace row, what it may be derived from, and its words.

### Modified Capabilities

- `architect-ui`: the projects list row becomes a derived activity line with a Needs you filter; the list says when the Architect runtime is not running; the project header leads with the state and one action, with Retry step lifted to it; pause also disarms the maintenance Workflow.
- `architect-project-record`: the index entry carries a derived activity and the observed-liveness stamp that "Working" depends on, and a dispatch records the triggers a project pause disarmed.
- `orchestrator-dispatch-handle`: the typed board action set gains one arming action so a plugin runtime can disarm and re-arm a Workflow's triggers without aborting a run.

## Impact

- `packages/common`: new activity-state module, a widened `OrchestratorBoardAction`, and liveness fields on the loop index view.
- `plugins/sero-architect-plugin`: `shared/types.ts`, `shared/record.ts`, `shared/lifecycle.ts`, `runtime/dispatch-link.ts`, `runtime/dispatch-watch.ts`, `runtime/projects-actions.ts`, `runtime/services.ts`, `ui/components/ProjectsList.tsx`, `ui/components/StateLine.tsx`, `ui/components/TopBar.tsx`, `ui/components/MilestoneRail.tsx`, `ui/widgets/ArchitectWidget.tsx`.
- `plugins/sero-orchestrator-plugin`: `shared/actions.ts`, `runtime/lifecycle.ts`, `runtime/store.ts`, `runtime/coordinator.ts`, `ui/OrchestratorApp.tsx`, `ui/components/HomeView.tsx`, `ui/components/AttentionQueue.tsx`, `ui/components/LoopList.tsx`, `ui/components/RoomsOverview.tsx`, `ui/lib/status-style.ts`, `ui/lib/loop-card.ts`, `ui/lib/orchestrator-navigation.ts`.
- `apps/desktop`: `src/components/layout/workspace/workspace-tree/WorkspaceNode.tsx` and the store that feeds it.
- No new dependency, no new IPC channel, no change to how plugins publish state.
