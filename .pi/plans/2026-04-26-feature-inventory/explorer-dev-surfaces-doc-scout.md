# Context for: Explorer workspace basics and dev-server surfaces docs

## Relevant Files
- `apps/docs-site/docs/guide/workspace-and-chat.md` — current docs-site baseline. It frames Explorer as the project workspace surface but intentionally avoids detailed Explorer workflows and alpha guarantees.
- `apps/docs-site/docs/reference/architecture.md` — states workspaces have a root, runtime mode, sessions, and `.sero-workspace.json`; container-backed mode is preferred and host mode is reduced.
- `apps/docs-site/docs/reference/troubleshooting.md` — gives the safe wording for host vs container caveats, including that browser automation, containerized tooling, and managed preview/dev-server automation are not host-mode guarantees.
- `.pi/plans/2026-04-26-feature-inventory/docs-launch-checklist.md` — Explorer docs are explicitly blocked pending runtime review; wording must stay conservative.
- `apps/desktop/src/components/apps/explorer/ExplorerWorkspace.tsx` — main Explorer shell: activity bar, sidebar, editor/browser area, terminal panel, resizable layout, and active-panel switching.
- `apps/desktop/src/components/apps/explorer/ExplorerSidebar.tsx` — sidebar content switches between file tree, source control, and orchestration panels.
- `apps/desktop/src/components/apps/explorer/file-tree/MultiRootFileTree.tsx` — multi-root UI: one `FileTree` per attached root, collapsible sections, detach action for non-primary roots.
- `apps/desktop/src/components/apps/explorer/file-tree/FileTree.tsx` — tree rendering and file actions via context menu; supports rename and delete hooks.
- `apps/desktop/src/components/apps/explorer/editor/EditorPanel.tsx` — Monaco editor plus file previews and dev-server previews; can swap into a diff preview or read-only file preview.
- `apps/desktop/src/components/apps/explorer/editor/DiffTab.tsx` — diff viewer for git revision comparisons, with its own file navigator and inline/side-by-side toggle.
- `apps/desktop/src/components/apps/explorer/browser/BrowserPanel.tsx` — workspace-scoped browser tabs/toolbar/bookmarks plus capture/share flows.
- `apps/desktop/src/components/apps/explorer/TerminalPanel.tsx` — xterm.js terminal per workspace terminal tab, backed by IPC and container/host execution.
- `apps/desktop/src/components/layout/workspace/WorkspaceTree.tsx` — workspace/session sidebar tree and collapse/add controls.
- `apps/desktop/src/components/layout/workspace/workspace-tree/WorkspaceNode.tsx` — shows container status, mount count, new session, container toggle, references, remote origin, and close workspace.
- `apps/desktop/src/components/layout/DevServerPanel.tsx` — status-bar popover for registered dev servers with open/stop/restart/remove actions.
- `apps/desktop/src/stores/workspace.ts` — workspace registry/state, active workspace, container toggle, references/mounts, and persistence of expanded state.
- `apps/desktop/src/stores/explorer.ts` — per-workspace Explorer UI state: sidebar open, active panel, terminal open, and saved panel sizes.
- `apps/desktop/src/stores/dev-server.ts` — dev-server registry sync/load/event handling.
- `apps/desktop/src/stores/container.ts` — container status tracking used by sidebar status indicator.
- `apps/desktop/src/types/ipc.ts` — canonical workspace/editor/container/dev-server types; `EditorRoot`, `WorkspaceInfo`, and `DevServer` are the key shapes for docs.
- `apps/desktop/electron/ipc/editor/editor.ts` — file ops and root discovery; container mode first, host fallback; `editor.getRoots` returns primary + attached roots.
- `apps/desktop/electron/ipc/container/container.ts` — container status/ensure IPC; `ensure` is called so terminals/tools can run once a session is selected.
- `apps/desktop/electron/ipc/browser.ts` — browser tab/bounds/capture IPC, all tab calls validated against workspace ownership.
- `apps/desktop/electron/ipc/container/dev-server.ts` — dev-server list/stop/restart/unregister/open-in-browser IPC.

## Key Findings
- Explorer is a single workspace surface split into three visible regions: file/navigation sidebar, main editor/browser area, and bottom terminal panel. The activity bar can switch the sidebar between Explorer, Source Control, and Orchestration.
- The file tree is multi-root aware. `editor.getRoots` returns the primary `/workspace` root plus any attached roots from `.sero-workspace.json`; the UI renders a collapsible section per root and can detach non-primary roots.
- File operations are not uniformly host-safe in the docs sense. The IPC layer tries container paths first when the workspace uses containers, then falls back to host filesystem operations. That means docs should avoid promising full parity or reliability in host mode.
- Editor surface can show: Monaco code editing, binary/media/document previews, dev-server previews, and git diff views. The diff view is revision-based, not an arbitrary file comparison UI.
- Browser panel is workspace-scoped and lives inside Explorer. It uses native `WebContentsView` content plus renderer chrome, supports navigation/history, bookmarks, page sharing, and screenshot capture into chat attachments.
- Terminal panel is workspace-scoped and tied to terminal tabs. It replays buffered output on remount, and terminal sessions are created/opened when the terminal panel is shown.
- Workspace sidebar exposes status and controls that are safe to mention: expand/collapse, active workspace/session selection, new session, container toggle, references, mounts count, remote origin, and close workspace. Container status is shown as none/starting/running/stopped/error.
- DevServerPanel is conservative by design: it only shows already registered dev servers. The available actions are open in browser, stop, restart, and unregister; it also displays framework, port, URL, and a status dot.
- Container-backed runtime is the preferred path for Explorer/browser/dev-server workflows. Host mode is supported but reduced, especially for browser automation, containerized tooling, and managed preview/dev-server automation.

## Gotchas
- Do not claim complete IDE parity; Explorer is a development workspace surface, not a full VS Code replacement.
- Do not promise dev-server automation will always work; the registry/panel surface only reflects servers the runtime already knows about.
- Avoid saying all file operations work equally in host mode. IPC explicitly falls back, and some workflows still expect containers.
- Internal APIs are alpha-shape. `window.sero.*` and workspace/container behavior should be documented as current implementation details, not stable public contracts.
- Multi-root docs should mention attached roots carefully: primary root is always `/workspace`, while extra roots come from workspace config and may be detached.
- Browser/preview claims should stay scoped to the in-app browser and preview features visible in source; do not generalize to arbitrary browser parity.
