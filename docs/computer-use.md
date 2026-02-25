# Agent Computer Use + Remote Control Gateway
 
## Context
 
Sero currently lets AI agents write and execute code inside local containers, but they can't **see or interact with** the software they build (no browser automation, no UI testing). Additionally, Sero is locked to the desktop app — there's no way to control it remotely from a phone, messaging app, or web browser.
 
This plan adds two major capabilities inspired by Cursor's Agent Computer Use and OpenClaw's remote control gateway:
 
1. **Agent Computer Use** — The agent can launch browsers, navigate UIs, click, type, take screenshots, and verify features visually inside its container sandbox
2. **Remote Control Gateway** — A WebSocket-based control plane (like OpenClaw) that lets you send tasks to Sero and receive results from anywhere via Discord, a web chat UI, or Tailscale
 
Everything runs locally on your machine. No cloud VMs.
 
---
 
## Phase 1: Browser Automation Tool (Playwright)
 
**Goal:** Give the agent a `browser` tool that wraps Playwright inside the container to navigate, interact with, and screenshot web UIs.
 
Playwright + Chromium are already installed in the container image (`Dockerfile.sero-node` line 22-23).
 
### New files
 
**`apps/desktop/electron/container/tools-browser.ts`** — The `browser` agent tool definition
 
- Single tool named `browser` with an `action` parameter (discriminated union):
  - `launch` — Start a headless Chromium browser and optionally navigate to a URL
  - `navigate` — Go to a URL
  - `click` — Click at CSS selector or x,y coordinates
  - `type` — Type text into a focused element or selector
  - `screenshot` — Capture the current page as PNG, return as base64 image content block
  - `scroll` — Scroll up/down
  - `evaluate` — Run arbitrary JS in the page (for assertions, reading DOM state)
  - `close` — Close the browser
- Uses `cm.exec()` to run a Python helper script inside the container (Python Playwright is already installed)
- Returns screenshots as `{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: '...' } }` content blocks so the LLM can see what the agent sees
- JPEG compression (quality 80) for screenshots >500KB to stay within API limits
 
**`apps/desktop/electron/container/browser-helper.py`** — Python script injected into the container at first `launch`
 
- Stateful: starts a Playwright browser, keeps a page reference
- Accepts JSON commands via stdin, writes JSON responses to stdout
- Runs headless Chromium with `--no-sandbox` flag (required for root in container)
- Manages browser lifecycle (launch → actions → close)
- Screenshot → base64 encoding built-in
- The script is written to `/tmp/sero-browser-helper.py` inside the container on first use via `cm.exec()`
 
### Modified files
 
**`apps/desktop/electron/container/tools.ts`** — Register the new `browser` tool
 
```ts
// Add import
import { createBrowser } from './tools-browser';
 
// Add to createContainerTools() return array
createBrowser(cm, workspaceId),
```
 
**`apps/desktop/electron/container/system-prompt.ts`** — Add browser automation instructions
 
Append a `## Browser Automation` section to `buildContainerPromptBlock()`:
- When to use the browser tool (testing web UIs, verifying features, reproducing bugs)
- Workflow: start dev server → `browser launch` → navigate to server URL → interact → screenshot → verify
- Always take a screenshot after key interactions for evidence
- Close the browser when done
- Use container IP URLs (not localhost)
 
### Reuse
 
- Follow exact `ToolDefinition` pattern from `tools-coding.ts:createBash()` — same schema style, `cm.exec()` usage, error handling
- Use `image-resize.ts` (`apps/desktop/electron/utils/image-resize.ts`) for screenshot compression if needed
- Screenshots returned as image content blocks — Pi SDK already supports these in agent messages
 
---
 
## Phase 2: Artifact Collection System
 
**Goal:** Collect screenshots, logs, and evidence from agent sessions into a structured artifact registry, displayable in the UI and attachable to PRs.
 
### New files
 
**`apps/desktop/electron/container/artifact-registry.ts`** — In-memory registry (follows `DevServerRegistry` pattern)
 
- `ArtifactRegistry` class with:
  - `add(workspaceId, sessionId, artifact)` — store artifact (screenshot, log, video)
  - `list(sessionId)` — get all artifacts for a session
  - `get(artifactId)` — get single artifact
  - `clear(sessionId)` — cleanup
- Artifact types: `screenshot`, `log`, `video`
- Each artifact: `{ id, sessionId, workspaceId, type, title, timestamp, path, base64?, mimeType }`
- Event emitter pattern (same as `DevServerRegistry.onChange()`) for UI updates
- Artifacts stored in container at `/workspace/.sero/artifacts/`
 
**`apps/desktop/electron/cli/commands/artifacts.ts`** — CLI commands for artifact management
 
- `artifacts list [--session <id>]` — list artifacts
- `artifacts save --title <title> --type <type> --path <path>` — manually save an artifact
- Agent can call these via `sero-cli` to explicitly save evidence
 
### Modified files
 
**`apps/desktop/src/types/ipc-channels.ts`** — Add `artifacts.*` IPC channel namespace
 
**`apps/desktop/electron/ipc/agent.ts`** — Wire artifact events into agent stream events
 
- New event types: `artifact_added`, `artifact_removed`
- When the browser tool takes a screenshot, auto-register it as an artifact
 
**`apps/desktop/electron/vcs/pr-ops.ts`** — Include artifact summary in PR body
 
- When creating a PR, append an "## Agent Verification" section with links to artifact screenshots
- Upload screenshots as GitHub PR comment images (via `gh` CLI)
 
### Reuse
 
- `DevServerRegistry` pattern (`apps/desktop/electron/container/dev-server-registry.ts`) for the registry design
- `IpcChannels` pattern for new channel definitions
- `AgentStreamEvent` union type for new artifact events
 
---
 
## Phase 3: Remote Control Gateway
 
**Goal:** Add an OpenClaw-style WebSocket gateway that lets you control Sero agent sessions from outside the desktop app.
 
### Architecture
 
```
[Discord Bot] ──┐
[Web Chat UI] ──┤──→ [WebSocket Gateway :18800] ──→ [Agent Session Pool]
[Tailscale]  ───┘         (Electron main process)
```
 
The gateway runs inside the Electron main process (not a separate process) to reuse the existing agent infrastructure directly.
 
### New files
 
**`apps/desktop/electron/gateway/index.ts`** — WebSocket gateway server
 
- `GatewayServer` class
- Binds to `127.0.0.1:18800` (localhost only by default, Tailscale for remote)
- WebSocket protocol with JSON frames (inspired by OpenClaw's protocol):
  - `connect` — authenticate client, declare client type (web/discord/cli)
  - `prompt` — send a message to an agent session
  - `steer` — steer a running agent
  - `abort` — abort current agent turn
  - `status` — get session status
  - Server push events: `agent_start`, `text_delta`, `tool_start`, `tool_end`, `agent_end`, `artifact_added`
- Authentication: token-based (generated on first run, stored in `~/.sero-ui/gateway-token`)
- Session management: maps gateway clients → workspace agent sessions
- Uses existing `pool` (agent session pool from `ipc/agent.ts`) — refactor pool access into a shared module
 
**`apps/desktop/electron/gateway/protocol.ts`** — Gateway message types and validation
 
- TypeScript types for all gateway messages (request/response/push)
- JSON Schema validation for inbound messages
- Idempotency key support for side-effecting methods
 
**`apps/desktop/electron/gateway/auth.ts`** — Gateway authentication
 
- Token generation and storage
- Client authentication on `connect`
- Rate limiting per client
 
**`apps/desktop/electron/gateway/channels/discord.ts`** — Discord bot adapter
 
- Uses `discord.js` library
- Bot connects to Discord, listens for DMs or mentions in configured channels
- Maps Discord messages → gateway `prompt` calls
- Streams agent responses back as Discord messages (chunked for 2000-char limit)
- Supports image attachments (screenshots/artifacts rendered as Discord embeds)
- Slash commands: `/sero <prompt>`, `/sero status`, `/sero abort`
- Configuration: bot token, allowed user IDs, channel IDs
 
**`apps/desktop/electron/gateway/channels/web.ts`** — Minimal web chat UI server
 
- Serves a simple HTML/CSS/JS chat interface on `http://127.0.0.1:18801`
- Connects to the gateway WebSocket from the browser
- Shows streaming agent responses, tool calls, screenshots
- Minimal implementation — single HTML file with embedded JS (no build step)
- Token authentication via URL parameter or login prompt
 
### Modified files
 
**`apps/desktop/electron/ipc/agent.ts`** — Extract agent pool into shared module
 
- Move the `pool` Map and key operations (`openSession`, `prompt`, `abort`, `steer`) into a new `apps/desktop/electron/agents/session-pool.ts`
- Both IPC handlers and the gateway import from the shared pool
- IPC handlers become thin wrappers around pool operations
 
**`apps/desktop/electron/ipc/shared-infra.ts`** — Initialize gateway on app boot
 
- Create and start `GatewayServer` instance
- Expose via `ensureInfra()` alongside existing managers
 
**`apps/desktop/src/types/ipc-channels.ts`** — Add `gateway.*` IPC channel namespace
 
- `gateway.getStatus` — get gateway running state
- `gateway.getToken` — get auth token for display in UI
- `gateway.setEnabled` — enable/disable gateway
 
**`apps/desktop/package.json`** — Add dependencies
 
- `discord.js` — Discord bot
- `ws` — WebSocket server (or use Electron's built-in if available)
 
### Reuse
 
- Agent session pool from `ipc/agent.ts` (refactored into shared module)
- `subscribeToSession()` pattern for streaming events to gateway clients
- `AgentStreamEvent` types for gateway push events
- `ensureInfra()` pattern for singleton initialization
 
---
 
## Phase 4: Tailscale Remote Access
 
**Goal:** Secure remote access to the gateway from anywhere via Tailscale.
 
### New files
 
**`apps/desktop/electron/gateway/tailscale.ts`** — Tailscale integration
 
- Detect if Tailscale is installed and running (`tailscale status`)
- Optionally bind gateway to Tailscale IP instead of localhost
- Use `tailscale serve` to expose gateway port on tailnet (tailnet-only, not public funnel)
- Auto-configure HTTPS via Tailscale's built-in cert provisioning
- Provides tailnet URL for display in UI (e.g., `https://my-mac.tail1234.ts.net:18800`)
 
### Modified files
 
**`apps/desktop/electron/gateway/index.ts`** — Support binding to Tailscale IP
 
- Accept `bindHost` option (`127.0.0.1` for local, tailscale IP for remote)
- TLS support when Tailscale provides certs
 
### Configuration
 
- Settings in `~/.sero-ui/agent/settings.json`:
  - `gateway.enabled: boolean` (default: false)
  - `gateway.tailscale: boolean` (default: false)
  - `gateway.discordToken: string` (bot token)
  - `gateway.allowedDiscordUsers: string[]` (user IDs)
 
---
 
## Phase 5: Enhanced Autonomous Workflow
 
**Goal:** Update the system prompt and agent tools to enable full autonomous "demos not diffs" workflow.
 
### Modified files
 
**`apps/desktop/electron/container/system-prompt.ts`** — Add autonomous verification section
 
```
## Autonomous Verification Workflow
 
When completing a task that involves UI changes or features:
1. Build the project and start the dev server
2. Launch the browser and navigate to the application
3. Test the feature by interacting with the UI (click, type, navigate)
4. Take screenshots at each key step as evidence
5. If something fails, fix it and re-test (iterate until working)
6. Save all screenshots as artifacts
7. Summarize what was verified with screenshot references
 
When completing a task that involves tests:
1. Run the test suite
2. If tests fail, fix and re-run (iterate until passing)
3. Take a screenshot of passing test output
4. Save as artifact
```
 
**`apps/desktop/electron/agents/pr-draft.ts`** — Include artifact evidence in PR drafts
 
- When generating PR descriptions, include artifact references
- "## Verification" section with screenshot thumbnails
 
---
 
## Dependency Graph
 
```
Phase 1 (Browser Tool) ← no dependencies, start here
Phase 2 (Artifacts) ← depends on Phase 1 (screenshots feed artifacts)
Phase 3 (Gateway) ← independent of Phase 1-2, can be parallel
Phase 4 (Tailscale) ← depends on Phase 3 (gateway must exist)
Phase 5 (Workflow) ← depends on Phase 1 + 2 (needs browser + artifacts)
```
 
Recommended order: **Phase 1 → Phase 2 → Phase 3 (parallel with 2) → Phase 4 → Phase 5**
 
---
 
## Verification Plan
 
### Phase 1 Test
1. Open a workspace with container enabled
2. Ask agent: "Start a Vite project, add a button that shows an alert, then use the browser to verify the button works"
3. Agent should: install vite, create project, start dev server, launch browser, navigate, click button, screenshot the alert, report success
 
### Phase 2 Test
1. After Phase 1 test, check that screenshots appear as artifacts in the session
2. Verify `sero-cli artifacts list` returns the screenshots
3. Create a PR and verify the artifact summary appears in the PR body
 
### Phase 3 Test
1. Enable gateway in settings
2. Connect to `ws://127.0.0.1:18800` with a WebSocket client
3. Send a `prompt` message and verify streaming response
4. Open `http://127.0.0.1:18801` in browser and verify web chat works
5. Configure Discord bot, send a DM, verify response
 
### Phase 4 Test
1. Enable Tailscale integration
2. Access gateway from another device on the same tailnet
3. Verify Discord bot works when gateway is Tailscale-bound
 
### Phase 5 Test
1. Ask agent to "build a todo app and verify it works end-to-end"
2. Agent should autonomously: scaffold → build → run → browser test → screenshot → report with evidence