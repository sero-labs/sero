# Findings: Container Integration

## Architecture Analysis

### Current Sero Agent Flow
```
User prompt → Zustand store (optimistic) → IPC → agent.ts pool
  → AgentSession.prompt() → LLM → tool calls
  → createCodingTools(wsPath) → executes on HOST filesystem
  → results → LLM → response → IPC → Zustand store → ChatPanel
```

### Target Container Agent Flow
```
User prompt → Zustand store (optimistic) → IPC → agent.ts pool
  → ensure container running for workspace
  → AgentSession.prompt() → LLM → tool calls
  → createContainerTools(containerManager, workspaceId) → container exec
  → results → LLM → response → IPC → Zustand store → ChatPanel
```

### Key Observation: Minimal Agent Pool Changes
The existing `agent.ts` architecture (pool, events, subscriptions) is sound.
The main change is swapping `createCodingTools(wsPath)` for `createContainerTools()`.
The `DefaultResourceLoader` still uses the host wsPath because:
1. Skills/prompts/extensions live on the host filesystem
2. AGENTS.md is discovered via cwd walk-up on the host
3. The bind mount means the same files are visible in both places
4. But the ResourceLoader needs host paths, not container paths

### System Prompt Override
The ref impl uses `systemPromptOverride` on `DefaultResourceLoader`. Current Sero
uses `extensionFactories` with `before_agent_start` to inject composite workspace
context. For container integration, we need BOTH:
1. Extension factory for composite workspace context (existing)
2. System prompt additions for container-specific instructions (new)

Best approach: add container instructions via the existing extension factory's
`before_agent_start` hook, appending container context after workspace context.

### Container Naming Convention
- Workspace ID: `global`, `sero-dev`, `my-project`
- Container ID: `sero-global`, `sero-sero-dev`, `sero-my-project`
- Potential issue: double `sero-` prefix for workspaces starting with `sero-`
- Resolution: acceptable, follows ref impl convention. Container IDs just need to be unique.

### SSH Agent Forwarding
The `container run --ssh` flag forwards the host's SSH agent socket into the container.
This enables `git clone/push/pull` with private repos. The `--ssh` flag is set at
container creation time (not per-exec), so it's part of the `container run` args.

### Environment Variables
The ref impl injects env vars from a persistence layer into every `container exec` call.
Current Sero doesn't have a user-facing env var manager, but the `.env` file at
`~/.sero-ui/agent/.env` is loaded by `electron/env.ts`. We can read from there and
inject into container exec calls.

### Port Forwarding / Container IP
Each container gets its own IP on the private network (e.g., `192.168.64.x`).
This is visible via `container inspect`. Dev servers inside the container that
bind to `0.0.0.0` are accessible from the host via this IP.
The container IP should be shown in the UI (WorkspaceTree tooltip, StatusBar).

### Image Build
The Dockerfile at `apps/desktop/images/Dockerfile.sero-node` builds `sero-node:latest`.
Build command: `container build -t sero-node:latest -f Dockerfile.sero-node .`
Run from the images directory. Should check `container image list` before building.

### Ghost Container Problem
Well-documented in docs/libs/container.md. Key rules:
- NEVER delete container storage directories directly
- NEVER use `container rm` (doesn't exist; use `container delete`)
- NEVER restart API server in normal operation
- ALWAYS use bind mounts for workspace data
- The `container stop` / `container start` cycle is safe

### File Watcher Approach
Host-side `fs.watch({ recursive: true })` on bind-mounted workspace directories.
Since container writes go through the bind mount to the host filesystem, the host
watcher sees all changes. This is the same approach as the ref impl and works well.

## Dependencies Already Present
- `@xterm/xterm`, `@xterm/addon-fit`, `@xterm/addon-web-links` — terminal UI
- `node-pty` — PTY for terminal sessions (externalised in esbuild)
- `@sinclair/typebox` — tool parameter schemas
- `@mariozechner/pi-coding-agent` — AgentSession, tools, ResourceLoader
- Container CLI v0.8.0 at `/usr/local/bin/container`
- `sero-node:latest` image already built

## Files That Need Changes (Impact Map)

### New Files (electron/)
- `electron/container/types.ts`
- `electron/container/lifecycle.ts`
- `electron/container/files.ts`
- `electron/container/terminal.ts`
- `electron/container/terminal-buffer.ts`
- `electron/container/index.ts`
- `electron/container/image.ts`
- `electron/container/tools.ts`
- `electron/container/system-prompt.ts`
- `electron/container/file-watcher.ts`
- `electron/ipc/container.ts`
- `electron/ipc/terminal.ts`

### New Files (src/)
- `src/stores/container.ts`
- `src/stores/terminal.ts`
- `src/components/apps/coding/TerminalPanel.tsx`
- `src/components/apps/coding/TerminalTabs.tsx`

### Modified Files
- `electron/main.ts` — startup/shutdown hooks
- `electron/ipc/agent.ts` — swap tools, add container start
- `electron/ipc/index.ts` — register new handlers
- `electron/sero-extension.ts` — add container context to system prompt
- `electron/preload.ts` — expose new APIs
- `src/types/ipc.ts` — new types + channels
- `src/types/electron.d.ts` — new API types
- `src/components/layout/WorkspaceTree.tsx` — container status indicator
- `src/components/apps/coding/CodingWorkspace.tsx` — terminal panel
- `src/components/apps/coding/ActivityBar.tsx` — terminal icon
