# React rendering performance audit

This ledger tracks the section-by-section audit of React rendering performance in
`apps/desktop` and `plugins`. React Doctor findings are candidates until the
surrounding render path confirms that they can affect renderer responsiveness.

## Method

For each section:

1. Inventory subscriptions, timers, IPC/file-watch updates, derived data, and large lists.
2. Run a path-scoped React Doctor performance scan and targeted source searches.
3. Classify candidates as confirmed, false positive, deferred, or low-value.
4. Profile frequently updating or ambiguous surfaces when static evidence is insufficient.
5. Apply the smallest behavior-preserving fix and run focused tests, typecheck, and a changed-scope scan.

General JavaScript micro-optimizations, backend-only findings, bundle-size findings,
and animation preferences are excluded unless they have a credible effect on render
frequency, layout, or paint cost.

## Progress

| Section | Status | Evidence and outcome |
| --- | --- | --- |
| Desktop foundations: entry points, stores, selectors, shared app runtime | Complete | Provider values and federated mount context are referentially stable. Added a focused workspace selector for identity-only consumers. |
| Desktop chat and collaboration | Complete | Removed two whole-agent subscriptions from controls that do not consume streaming messages. Existing message/tool memo boundaries are appropriate; remaining feed lists are small. |
| Desktop explorer: file tree and editor | Complete | File watches are scoped and editor/Monaco updates stay behind imperative or workspace-specific boundaries. No high-value change identified. |
| Desktop explorer: browser and terminal | Complete | Browser state is workspace-scoped and xterm output is imperative. Replaced handler-only screenshot drag state with a ref. |
| Desktop explorer: VCS and orchestration | Complete | Narrowed whole-store/workspace subscriptions, restored effective list memo boundaries, and isolated workspace-specific subagent updates. |
| Desktop dashboard and federated apps | Complete | Memoized stable app-mount and shell boundaries; dashboard subscriptions were already appropriately scoped. |
| Desktop shell, workspace, and titlebar | Complete | Isolated workspace rows, narrowed breadcrumb and Git-control subscriptions, and prevented watcher restarts on unrelated workspace changes. |
| Desktop models, themes, auth, profiles, and diagnostics | Complete | Isolated theme-editor sections and diagnostic result lists. Remaining candidates were low-frequency, animation-specific, or would not remove a render. |
| Plugin: Git | Complete | Heavy top-level sections no longer redraw for transient notices and unrelated local diff state. |
| Plugin: Orchestrator | Complete | Stabilized navigation/actions and isolated loop-list and plan rendering from live detail state. |
| Plugin: MCP | Complete | Search and server-manager boundaries ignore unrelated bootstrap, diagnostics, and config state. |
| Plugin: Cron | Complete | Removed handler-only state and effect-driven schedule validation. |
| Plugin: Usage | Complete | Compact widget ignores invisible refresh status; chart/table/stat boundaries are memoized. |
| Plugin: Admin | Complete | Resource lists are isolated from editor keystrokes and plugin-development callbacks are stable. |
| Plugin: Web | Complete | Removed duplicate file-state subscriptions and isolated bookmark form/list work. |
| Plugin: User Feedback | Complete | Interview answer edits now redraw only the changed question row. |
| Plugin: Graphify | Complete | Search state is colocated so workspace rows do not redraw while typing/searching. |
| Plugin: Memory | Not applicable | No React UI source; runtime-only plugin. |

## Baseline

- Desktop renderer: 218 React source/test files; 207 are under `src/components`.
- Desktop feature concentration: 125 React files under layout and 58 under apps,
  including 48 in explorer.
- Plugin renderers range from 1 to 33 React files and are audited independently.
- React Compiler is not configured, so subscription boundaries and referential
  stability remain explicit application concerns.
- The initial broad desktop React Doctor performance scan reported 140 candidates
  (33 errors and 107 warnings). It also scanned Electron/backend code, confirming
  that path and render-path filtering are required.

## Findings

### RR-001: Identity-only chat controls subscribed to the full agent

- **Trigger:** every streamed assistant token replaces the focused `AgentInstance`.
- **Impact:** `ThinkingBlocksToggle` and `CollaborationActivityPanel` re-rendered even
  though neither consumes message content. The collaboration subtree includes motion
  elements and a derived activity feed.
- **Disposition:** confirmed, high confidence.
- **Change:** `ThinkingBlocksToggle` now uses the existing model-state selector;
  collaboration uses scalar session and workspace selectors.
- **Validation:** added a selector isolation regression test proving streaming-only
  agent updates do not re-render workspace consumers. Desktop typecheck and all 1,692
  desktop tests pass. The changed-scope React Doctor score is 91/100; its remaining
  findings in touched files are pre-existing accessibility, bundle, and array-loop
  candidates unrelated to this change.

### RR-002: VCS forms and details subscribed to every VCS update

- **Trigger:** watcher refreshes replace per-workspace log, status, bookmark, remote,
  loading, and diff state.
- **Impact:** branch/remote forms and expanded change details redrew for unrelated
  workspace VCS changes; the status bar also subscribed to the full workspace VCS object.
- **Disposition:** confirmed, high confidence.
- **Change:** replaced whole-store subscriptions with stable action selectors and scalar
  field selectors. The status bar now subscribes only to bookmarks and the active push branch.
- **Validation:** focused VCS tests and desktop typecheck pass.

### RR-003: VCS list memo boundaries were missing or defeated

- **Trigger:** local form typing, expansion changes, notices, and other parent state updates.
- **Impact:** commit, branch, and working-copy rows reconciled even when their data was unchanged.
- **Disposition:** confirmed, high confidence.
- **Change:** passed a stable commit-toggle callback, memoized branch rows with keyed action
  callbacks, and isolated the working-copy file list behind a memo boundary.
- **Validation:** focused VCS tests pass; touched source files remain below 500 lines.

### RR-004: Workspace and session rows subscribed to shared identifiers

- **Trigger:** another workspace expanded, active workspace/session changed, session
  streaming changed, or another workspace's selection changed.
- **Impact:** unchanged shell consumers and all workspace/session rows could redraw.
- **Disposition:** confirmed, high confidence.
- **Change:** the active-workspace hook now selects the resolved object directly;
  workspace/session rows select per-row booleans/counts and workspace nodes are memoized.
- **Validation:** selector regression tests prove unrelated workspace and streaming updates
  do not redraw unchanged consumers; desktop typecheck passes.

### RR-005: Screenshot drag lifecycle used render state only as an event guard

- **Trigger:** pointer down/up while selecting a screenshot region.
- **Impact:** two reconciliations per drag with no visual dependency on the boolean.
- **Disposition:** confirmed, high confidence using the canonical React Doctor rule prompt.
- **Change:** moved the drag guard to a ref; the visible rectangle remains state-driven.

### RR-006: Orchestration updates redrew unrelated cards and workspaces

- **Trigger:** live subagent entry/output updates and one-second elapsed timers.
- **Impact:** the panel filtered the global entry record and non-updated cards lacked a memo boundary.
- **Disposition:** confirmed, high confidence.
- **Change:** workspace-filtered shallow selectors now ignore other workspaces, and subagent
  cards are memoized so stable entries do not redraw when a sibling changes.
- **Validation:** focused desktop tests, typecheck, and `git diff --check` pass.

### RR-007: Plugin roots coupled unrelated local and file-backed updates

- **Trigger:** notices, bootstrap completion, diagnostics/config refreshes, selected-loop
  live updates, search state, and refresh status.
- **Impact:** stable commit graphs, branch/staging panels, MCP server management, loop
  sidebars/plans, and Usage analytics could redraw without relevant prop changes.
- **Disposition:** confirmed across Git, Orchestrator, MCP, and Usage; high confidence.
- **Change:** added stable callbacks and memo boundaries at existing independent UI sections;
  the Usage widget can opt out of refresh status it never displays.
- **Validation:** regression tests assert Git commit-graph and MCP server-manager isolation.
  All four plugin typechecks and 889 plugin tests pass.

### RR-008: Plugin form state redrew adjacent lists

- **Trigger:** editor keystrokes, bookmark/search input, and interview answer changes.
- **Impact:** Admin resource lists, Web bookmarks, Graphify workspace rows, and every
  interview question row reconciled for changes local to one form or row.
- **Disposition:** confirmed across Admin, Web, Graphify, and User Feedback; high confidence.
- **Change:** colocated local form/search state, memoized stable list/row boundaries, and
  lifted Web file-backed state to the existing root subscription.
- **Validation:** affected plugin typechecks and tests pass; User Feedback and Graphify
  changed-scope React Doctor scans are clean.

### RR-009: Cron validation used state synchronized by an effect

- **Trigger:** every recurring schedule edit.
- **Impact:** schedule validation caused a second render after the input render; the
  constant notification channel was also held in state despite never changing.
- **Disposition:** confirmed, high confidence.
- **Change:** cron validation is derived during render and the constant channel is written
  directly into the saved reminder.
- **Validation:** Cron typecheck and all 231 tests pass.

### RR-010: Stable shell and app subtrees lacked memo boundaries

- **Trigger:** shell layout changes, app registry updates, and parent reconciliation while
  the mounted app, sidebar, or title bar inputs were unchanged.
- **Impact:** independent shell and federated-app subtrees could reconcile despite owning
  their own scoped subscriptions.
- **Disposition:** confirmed, medium confidence.
- **Change:** memoized the active app panel, federated app mount, main sidebar, and title bar.
  The dashboard itself already used appropriately scoped state.
- **Validation:** focused shell/app tests and desktop typecheck pass.

### RR-011: Git title-bar watchers depended on the whole workspace object

- **Trigger:** any immutable update to the active workspace object.
- **Impact:** repository-name and remote-status watchers could be torn down and restarted
  even when the workspace path was unchanged; breadcrumb consumers also received unrelated
  workspace fields.
- **Disposition:** confirmed, high confidence.
- **Change:** selected only workspace id, name, and path primitives and keyed watcher effects
  to the path. Breadcrumbs now select only the displayed workspace name.
- **Validation:** focused title-bar tests and desktop typecheck pass.

### RR-012: Theme and diagnostic parent updates crossed stable section boundaries

- **Trigger:** editing one theme token group, theme metadata changes, autosave state, or
  diagnostic progress updates.
- **Impact:** unrelated theme editor sections and an unchanged diagnostic result list could
  reconcile with their parent.
- **Disposition:** confirmed, medium confidence.
- **Change:** split theme editor props into stable token groups, memoized its independent
  sections, stabilized save/copy callbacks, and memoized diagnostic categories. Preview and
  autosave side effects were also moved out of React state updater callbacks.
- **Validation:** 12 focused theme/diagnostic tests, desktop typecheck, and the assigned
  changed-scope React Doctor scan pass.

## Deferred and excluded candidates

- Framer Motion import and `height: 0` to `height: auto` diagnostics concern bundle policy
  or intentional enter/exit animation, not an established avoidable render.
- Generic chained-array and loop findings are JavaScript micro-optimizations without evidence
  of meaningful renderer cost in these paths.
- Handler-only state in auth/profile forms is batched with visible state changes, so replacing
  it with refs would not remove a commit.
- Large-component and reducer suggestions were not changed unless they exposed a concrete
  subscription or reconciliation problem.

## Final validation

- Root `pnpm typecheck`: 22/22 tasks passed.
- Root `pnpm test`: 15/15 tasks passed. Desktop completed 322 files and 1,693 tests;
  the affected plugin suites also passed in the root run.
- React Doctor v0.7.8 changed-file Performance scan: 60 files scanned. The remaining
  21 diagnostics are the documented animation, bundle-loading, and array-loop exclusions
  above; Admin, Cron, Git, Graphify, MCP, User Feedback, and Web have zero remaining
  changed-file Performance diagnostics.
- `git diff --check` passes and every touched source file remains below 500 lines.
