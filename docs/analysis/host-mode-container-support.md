# Host-Only Runtime Support vs. macOS Containers — Analysis & Recommendations

**Date:** 2026-04-17  
**Goal:** Make Apple macOS containers the **strongly recommended** runtime, not a hard requirement, while clearly documenting what does and does not work in host-only mode.

---

## 1. Executive Summary

Sero already has a **partial host-mode fallback** today.

If a workspace has containers enabled but the container system is unavailable or container startup fails:
- **agent sessions** fall back to host-side coding tools
- **subagents** fall back to host-side coding tools
- some **editor** reads/listing fall back to host filesystem access
- boot continues because container startup failures are treated as **non-blocking**

However, support is currently **inconsistent**:
- some features degrade gracefully
- some features require the user to manually toggle the workspace to host mode
- some features are effectively **container-only**
- docs still describe containers as a **hard requirement**, which no longer matches implementation

### Recommended product direction

Treat runtime selection as:
- **Preferred:** container runtime
- **Supported fallback:** host runtime
- **Clearly documented limitations:** browser automation, containerized LSP, container-aware preview/dev-server management, isolated Linux environment, etc.

In other words: **prefer containers, don’t require them**.

---

## 2. What the codebase does today

### 2.1 Boot behavior

App boot tries to start the container system, but failure is non-fatal.

Source:
- `apps/desktop/electron/main.ts`

Behavior:
- `containerManager.ensureSystemRunning()` is attempted on startup
- if it fails, Sero logs that containers will retry on demand
- app startup continues

This is already compatible with a “containers recommended, not required” model.

### 2.2 Workspace config and user opt-in/out

Container usage is already configurable **per workspace**.

Source:
- `apps/desktop/electron/features/workspace/manager.ts`
- `apps/desktop/electron/ipc/workspace/workspace.ts`
- `apps/desktop/src/stores/workspace.ts`
- `apps/desktop/src/components/layout/workspace/workspace-tree/WorkspaceNode.tsx`

Current behavior:
- `.sero-workspace.json` supports `"container": false`
- if the key is omitted, container mode defaults to **enabled**
- the workspace tree UI has an explicit toggle:
  - `Disable container (use host)`
  - `Enable container`
- the default `global` workspace is explicitly created with `container: false`

### 2.3 Agent session behavior

Agent sessions already degrade from container tools to host tools.

Source:
- `apps/desktop/electron/ipc/agent/core/agent-session-open.ts`

Current behavior:
- if the workspace is container-enabled, Sero attempts to ensure the workspace container
- if startup succeeds, the session gets container tools
- if startup fails, the session emits `container_error` and falls back to:
  - `createHostCodingTools(workspacePath)`
  - `createWorkspaceCliTool(...)`

This is the strongest existing evidence that host-only mode is already a supported fallback in practice.

### 2.4 Subagent behavior

Subagents also degrade to host tools.

Source:
- `apps/desktop/electron/features/subagent/runtime/runner.ts`

Current behavior:
- if the container is unavailable, subagents log a warning and use host tools instead

### 2.5 Editor/file tree behavior

Editor behavior is mixed.

Source:
- `apps/desktop/electron/ipc/editor/editor.ts`

Current behavior:
- `readFile` falls back to host reads if the workspace is enabled for containers but no container is running
- `readBinaryFile` also falls back to host reads
- `listFiles` falls back to host listing
- but `writeFile` and `exec` currently use the container path whenever the workspace is marked container-enabled
  - they do **not** first check `containerManager.hasContainer(workspaceId)`
  - this creates an inconsistency between read/list vs write/exec behavior

### 2.6 Terminal behavior

Terminal behavior is also mixed, but understandable.

Source:
- `apps/desktop/electron/ipc/container/terminal.ts`
- `apps/desktop/src/components/apps/explorer/TerminalTabs.tsx`
- `apps/desktop/electron/features/container/terminal/terminal.ts`

Current behavior:
- if the workspace is **opted out** of containers, terminals run directly on the host
- if the workspace is container-enabled, terminal creation requires a running container
- if containers are unavailable and the workspace is still marked container-enabled, users may be blocked from creating terminals until they toggle the workspace to host mode

### 2.7 LSP behavior

LSP is currently **container-only**.

Source:
- `apps/desktop/electron/features/editor/lsp/lsp-manager.ts`
- `apps/desktop/src/lsp/use-lsp.ts`

Current behavior:
- the hook explicitly says it is only active for containerized workspaces
- language servers are installed and run inside the workspace container
- there is no host-mode LSP equivalent today

### 2.8 Dev server / preview behavior

Managed preview/dev-server features are effectively **container-only** today.

Source:
- `apps/desktop/electron/features/kanban/workspace/workspace-runtime-refresh.ts`
- `apps/desktop/electron/features/kanban/review/workflow/review-preview.ts`
- `apps/desktop/electron/features/kanban/implementation/dev-server-launch.ts`

Current behavior:
- auto-started preview/dev-server flows are skipped when a workspace is not container-enabled
- the registry and networking model are built around container execution + container IP discovery

### 2.9 Browser automation behavior

Agent browser automation is currently **container-only**.

Source:
- `apps/desktop/electron/features/container/tools/tools.ts`
- `apps/desktop/electron/features/container/tools/system-prompt.ts`

Current behavior:
- `createContainerTools(...)` includes a `browser` tool
- host fallback tools only include coding tools (`bash`, `read`, `write`, `edit`)
- therefore host-mode sessions do **not** get browser/computer-use automation

### 2.10 Evidence that host mode is already treated as legitimate in tests

There is explicit e2e coverage that disables containers so the host filesystem is used directly.

Source:
- `apps/desktop/e2e/file-tree.spec.ts`

That test setup would not exist if host mode were purely accidental.

---

## 3. Current mismatch: product messaging vs implementation

### Docs currently say

`docs/sero.md` still says:
- Apple Container CLI is part of platform constraints
- “**Hard requirement:** Every agent session is sandboxed inside a container”

### Code currently does

The codebase already allows:
- non-fatal container bootstrap failure at app startup
- host fallback for agent sessions
- host fallback for subagents
- explicit per-workspace container disable
- host terminals when workspace container mode is disabled

### Conclusion

The implementation has already moved toward:
- **containers preferred**
- **host mode tolerated / partially supported**

The documentation and product framing should catch up.

---

## 4. Host-only support matrix

### 4.1 What works well enough today

| Capability | Host-only today | Notes |
|---|---|---|
| Open app without containers installed | ✅ | Boot is non-blocking if container system startup fails |
| Per-workspace opt out of containers | ✅ | `"container": false` in `.sero-workspace.json` or workspace tree toggle |
| Agent chat with coding tools | ✅ | Falls back to host tools on container failure |
| Subagents | ✅ | Falls back to host tools |
| File tree browsing | ✅ | Host fallback exists for reads/listing |
| Host terminals | ✅ | Works when workspace is explicitly non-container |
| Git on host | ✅ | `GitRunner` has host execution path when workspace is non-container |

### 4.2 What is inconsistent / fragile

| Capability | Host-only today | Problem |
|---|---|---|
| Editor write/exec when workspace is still marked container-enabled but container is unavailable | ⚠️ | More brittle than read/list; missing the same graceful fallback pattern |
| Terminal creation when workspace is container-enabled but container is unavailable | ⚠️ | User may have to manually toggle to host mode first |
| CLI/workspace command execution paths | ⚠️ | Some paths error instead of degrading to host |
| User-facing explanation of what happened | ⚠️ | Mostly logs + container status dot, not enough onboarding/UX |

### 4.3 What is effectively container-only today

| Capability | Host-only today | Why |
|---|---|---|
| Browser / computer-use automation | ❌ | Browser tool exists only in `createContainerTools(...)` |
| Container-managed LSP | ❌ | LSP manager installs/runs servers in the container only |
| Containerized dev-server registry / auto-preview | ❌ | Depends on container execution + container IP / port scanning |
| Linux package/install parity | ❌ | Host mode uses the macOS host shell, not the Linux workspace image |
| Container network semantics / isolated ports | ❌ | Host mode uses host networking |
| Workspace reference mounts into container | ❌ / n/a | Those UI concepts exist specifically for container bind mounts |

---

## 5. Product stance recommendation

### Recommended stance

> Sero works best with Apple macOS containers and strongly recommends them for full functionality, but it can run in a reduced host-only mode when containers are unavailable or disabled.

This stance fits the codebase better than a hard requirement.

### Suggested wording for docs / onboarding

Use wording like:
- **Recommended:** Apple Container CLI for full sandboxing, browser automation, managed previews, and containerized language servers
- **Fallback supported:** host runtime for core editing, terminals, and agent coding tasks
- **Limitations in host mode:** browser tool unavailable, no containerized LSP, reduced preview/dev-server management, no Linux environment parity

Avoid wording like:
- “hard requirement”
- “Sero does not work without containers”

That is no longer accurate.

---

## 6. Main problems to solve

### Problem 1 — Runtime resolution is fragmented

Different parts of the app answer slightly different questions:
- “Is this workspace configured for containers?”
- “Is a container currently running?”
- “Should we try to ensure a container now?”
- “Should we fall back to host tools?”

This logic is spread across multiple IPC handlers and runtime components.

Result:
- behavior varies by feature
- some paths fall back cleanly
- some paths error
- some paths require manual user intervention

### Problem 2 — Container-unavailable vs container-disabled are not clearly separated in UX

Today the user can be in one of several states:
- container intentionally disabled for workspace
- container desired, but not started yet
- container desired, but failed to start
- container system unavailable on machine

These states are not surfaced clearly enough to the user.

### Problem 3 — No first-class “host mode capability model”

The code knows how to do host fallback in some places, but there is no explicit runtime capability model such as:
- `hasBrowserAutomation`
- `hasContainerLsp`
- `hasManagedDevServers`
- `hasLinuxSandbox`

Without that model, feature gating remains ad hoc.

### Problem 4 — No global preference

Today container choice is only per-workspace.

That works, but it leaves gaps for users who:
- do not have containers installed yet
- want to default all new workspaces to host mode
- want to later flip back to “prefer containers” once installed

### Problem 5 — Docs don’t explain host-mode limitations

Users need a clear answer to:
- what still works?
- what becomes degraded?
- what is unavailable entirely?
- how do I opt in later?

That documentation is currently missing.

---

## 7. Recommended improvements

## 7.1 Phase 1 — Update positioning and docs first

This is the highest-leverage change.

### Recommendations

1. **Change product language**
   - Replace “hard requirement” in `docs/sero.md`
   - Describe containers as **recommended for full functionality**

2. **Add a host-mode support section to docs**
   - Include a capability matrix like section 4 above
   - Explain that the best experience is containerized, but core use still works on host

3. **Document opt-in/out clearly**
   - UI path: workspace tree toggle
   - file path: `.sero-workspace.json`
   - config example: `"container": false`

4. **Document known host-only limitations explicitly**
   - no browser/computer-use tool
   - no containerized LSP
   - no managed preview/dev-server auto-start behavior
   - different networking semantics
   - no Linux environment/image parity

### Why do this first?

Because the implementation already partially supports host mode. The fastest win is to make the product story honest and understandable.

---

## 7.2 Phase 2 — Add explicit runtime detection + user-facing guidance

### Recommendations

Add a first-class container diagnostic check at startup and/or onboarding:
- container binary exists (`/usr/local/bin/container`)
- correct macOS / Apple Silicon prerequisites
- container system can start
- container image is available or buildable

Then show a user-facing state like:
- **Containers available**
- **Containers not installed**
- **Containers installed but not running**
- **Containers installed but startup failed**

### UX suggestions

When containers are unavailable, show a banner or onboarding card:
- “Containers are recommended for full functionality”
- “Sero will continue in host mode”
- actions:
  - `Set up containers`
  - `Continue in host mode`
  - `Disable containers for this workspace`
  - `Retry`

### Benefit

This turns fallback from “silent implementation detail” into a clear, intentional user experience.

---

## 7.3 Phase 3 — Centralize runtime resolution

### Recommendation

Introduce a shared runtime resolver, something conceptually like:

```ts
interface WorkspaceRuntimeResolution {
  desired: 'container' | 'host';
  actual: 'container' | 'host';
  reason:
    | 'workspace-disabled'
    | 'container-unavailable'
    | 'container-start-failed'
    | 'container-running'
    | 'host-forced';
  capabilities: {
    browserAutomation: boolean;
    containerLsp: boolean;
    managedDevServers: boolean;
    linuxSandbox: boolean;
  };
}
```

All major feature entry points should use the same resolver:
- agent session open
- subagents
- editor IPC
- terminal IPC
- git runner
- workspace command runner
- dev-server/preview flows
- LSP startup

### Benefit

This would remove today’s inconsistent “some handlers check `hasContainer`, some only check `isContainerEnabled`, some attempt ensure, some don’t” behavior.

---

## 7.4 Phase 4 — Make host fallback consistent where appropriate

### Recommended consistency fixes

1. **Editor IPC**
   - align `writeFile` and `exec` with the same fallback behavior already used in `readFile`, `readBinaryFile`, and `listFiles`

2. **Terminal creation**
   - if the workspace wants containers but they are unavailable, either:
     - offer automatic temporary host fallback, or
     - show an explicit “Use host terminal instead” action

3. **Git/workspace command runners**
   - when container runtime is unavailable, degrade to host execution when safe and when the product policy allows it

4. **Agent runtime messaging**
   - when a session falls back to host tools, add a visible transcript/system notice such as:
     - “Container unavailable — continuing in host mode with reduced functionality.”

### Important nuance

Not every feature should silently fall back. Some should instead:
- disable themselves
- explain why
- point user toward enabling containers

That is especially true for container-specific features like browser automation and managed previews.

---

## 7.5 Phase 5 — Introduce explicit capability-aware feature gating

### Recommendation

Gate UI and agent affordances from runtime capabilities rather than scattered runtime assumptions.

Examples:
- hide or disable browser/computer-use controls in host mode
- show “LSP requires containers” instead of quietly doing nothing
- show “Managed preview requires containers” in review/kanban flows
- hide container-mount controls when the workspace is in host mode

### Benefit

This avoids confusing “nothing happened” failure modes.

---

## 7.6 Phase 6 — Add a global preference, while keeping per-workspace override

### Recommendation

Add an app-level setting such as:
- `containers.mode = 'prefer' | 'off' | 'require'`

Suggested semantics:
- `prefer` (recommended default)
  - new workspaces default to container mode
  - if unavailable, Sero offers host fallback
- `off`
  - new workspaces default to host mode
- `require`
  - strict mode for users who want enforced sandboxing

Per-workspace `.sero-workspace.json` can still override the default.

### Why this matters

It solves the current gap where users without containers have to disable each workspace one by one.

---

## 8. What should be documented as unavailable in host mode

The following should be called out clearly in docs if Sero officially supports host-only fallback.

### Definitely unavailable or reduced today

1. **Browser / computer-use automation**
   - host mode does not currently expose the `browser` tool

2. **Containerized language servers (LSP)**
   - current LSP architecture assumes servers are installed and run inside containers

3. **Managed preview/dev-server automation**
   - review preview and auto-start server flows skip non-container workspaces

4. **Linux environment parity**
   - commands run on the macOS host, not the Linux workspace image
   - package availability and behavior may differ

5. **Container-specific networking semantics**
   - no container IP
   - host port conflicts matter again
   - localhost behavior differs from container-mode guidance

6. **Container mount/reference features**
   - workspace references/mounts are specifically about bind mounts into a container runtime

### Potentially available later, but not yet

1. **Host-mode LSP**
   - possible future enhancement if host language servers are acceptable

2. **Host-mode managed dev servers**
   - possible future enhancement if the registry is generalized beyond container IP scanning

3. **Host-mode browser automation**
   - possible future enhancement, but would need different isolation/safety semantics

---

## 9. Recommended implementation order

### P0 — documentation + messaging
- update `docs/sero.md`
- add host-mode limitations docs
- explain per-workspace container toggle and `.sero-workspace.json`

### P1 — runtime detection + UX
- detect container availability
- show clear recommended/fallback messaging
- expose “continue in host mode” intentionally

### P2 — central runtime resolver
- unify desired vs actual runtime
- standardize fallbacks and capability checks

### P3 — consistency fixes
- editor write/exec fallback
- terminal fallback UX
- better agent notices when host fallback is in effect

### P4 — global preference
- `prefer` / `off` / `require`

### P5 — capability-driven feature gating
- browser/LSP/preview UI messaging and disable states

---

## 10. Bottom line

Sero should not present containers as a hard requirement anymore.

A more accurate and user-friendly model is:
- **Containers are strongly recommended** for the best, safest, most capable experience
- **Host mode is supported as a reduced fallback** for core workflows
- **Some features remain container-only** and should be clearly documented and surfaced in the UI

That direction matches the codebase better, reduces friction for new users, and still preserves the product’s strong preference for containerized execution.
