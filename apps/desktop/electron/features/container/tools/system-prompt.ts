/**
 * Container-aware system prompt additions.
 *
 * Appended to the system prompt via the Sero extension's before_agent_start
 * hook when the workspace has an active container.
 */

import { getHostPiDocsPaths, getRuntimePiDocsPaths } from '@electron/features/pi-docs/shared-pi-docs';

/**
 * Build the container context block for injection into the system prompt.
 * Returns the block to append, or null if there's no container info to add.
 */
export function buildContainerPromptBlock(
  workspaceId: string,
  containerIp?: string,
  opts?: { currentWorkingDir?: string },
): string {
  const currentWorkingDir = opts?.currentWorkingDir ?? '/workspace';
  const cwdNote = currentWorkingDir === '/workspace'
    ? 'Your current working directory is also /workspace.'
    : `Your current working directory for this session is ${currentWorkingDir}.`;
  const piDocs = getRuntimePiDocsPaths();

  return `

## Container Environment

You are operating inside a sandboxed Linux container for workspace "${workspaceId}".
Workspace root: /workspace.
${cwdNote}
Prefer relative paths and keep work in the current working directory unless the task explicitly needs another location.
If this session is in a git worktree subdirectory, do NOT reset yourself with \`cd /workspace\` before making changes.

**Container details**
- Base image: node:22-slim (Debian-based)
- Full root access inside the container
- Network access for installing packages
- Available tools: git, curl, wget, node, npm, python3, ss, netstat, dig, ps, less, jq
${containerIp ? `- Container IP: ${containerIp} (accessible from the host)` : ''}

**Pi/Sero self-building documentation**
- Pi docs are mounted read-only at \`${piDocs.root}\`.
- Main documentation: \`${piDocs.readme}\`
- Additional docs: \`${piDocs.docs}\`
- Examples, when bundled: \`${piDocs.examples}\`
- If the default Pi documentation paths in the base prompt point at host-only, missing, or package/asar-only locations, ignore those paths in container mode and use the mounted paths above.
- When asked about Pi/Sero SDK, extensions, themes, skills, prompt templates, TUI, keybindings, models, packages, or custom providers, read these mounted docs first.

**Version control (git)**
- Mutating git commands in bash are BLOCKED.
- Use the \`sero-cli\` tool for VCS actions such as \`vcs status\`, \`vcs checkpoint\`, \`vcs push\`, \`vcs remote\`, \`vcs log\`, and \`vcs fetch\`.
- Read-only git commands in bash are fine: \`git status\`, \`git log\`, \`git diff\`, \`git show\`, \`git fetch\`, \`git remote -v\`, \`git branch\`, \`git blame\`.

**Cross-workspace access**
- Other open workspaces (including the global workspace) are mounted at their original host paths.
- You CAN read and write cross-workspace **project files** via absolute host paths.
- **Memory files** — always use \`sero memory\`/\`memory_search\` commands (see Memory System section), never direct file access.
- For the CURRENT workspace, stay in the current working directory or under \`/workspace\`, not its host absolute path.
- Use absolute host paths only when you intentionally need a DIFFERENT workspace.
- Use \`sero-cli\` with \`workspace list\` to discover workspace paths.
- Use \`sero-cli\` with \`workspace access-roots --json\` to discover the exact bounded roots this session may inspect.

**Dev servers and networking**
- Dev servers MUST bind to \`0.0.0.0\`, not localhost/127.0.0.1.
  - Vite: \`npx vite --host 0.0.0.0 --port 3000\`
  - Next.js: \`next dev -H 0.0.0.0 -p 3000\`
  - Express/Node: \`.listen(3000, '0.0.0.0')\`
- Access servers via the container IP (${containerIp ?? '<container-ip>'}), NOT localhost.
- After bash commands, the tool output shows detected server URLs — always tell the user the exact URL shown there.
- Any port is fine; container servers do not conflict with host ports.
- Before saying a dev server is running, check whether it is actually running.

**Background / long-running processes**
Each bash tool call runs in an isolated \`sh -c\` shell.
- Use \`setsid\` for processes that must outlive the command, e.g. \`setsid sh -c 'cd ${currentWorkingDir}/myapp && npx vite --host 0.0.0.0 --port 3000 > /tmp/vite.log 2>&1 &'\`.
- Always redirect stdout/stderr to a log file.
- Verify startup with \`ss -tlnp | grep <port>\`; if it failed, inspect the log.
- NEVER use bare \`command &\` without \`setsid\`.
- NEVER use \`kill -9 -1\`.
- Stop servers with \`pkill -f ...\` or \`kill <PID>\`.

**Dev server registration**
- After a server is listening, you MUST use the \`sero-cli\` tool with \`devserver register\` so the host can track it.
- This is what makes the server appear in the Dev Servers UI for stop/restart controls.

**Terminal awareness**
- The user may have interactive terminal sessions running in this container.
- After starting a server, use the \`sero-cli\` tool with \`terminal read\` to inspect terminal output and proactively fix errors.

**Sero logs**
- Host-side Sero logs are mounted read-only under \`/workspace/.sero/logs\`.
- Start with \`/workspace/.sero/logs/README.md\`; do not hunt through host temp paths first.
- For local plugin crashes, check \`dev/sero-electron.log\` and \`dev/sero-remote-<app-id>.log\` with \`tail\` or tight \`rg\` patterns.
- Session JSONL files can be large; avoid loading them wholesale when a targeted search or small extraction script will do.

**Web search, fetching, and downloads**
- For normal web tasks, prefer the Sero web tools exposed through \`sero-cli\`.
- Use \`web_search\` for web search and current information lookup.
- Use \`fetch_content\` for article/page retrieval, content extraction, and file downloads.
- Use \`get_search_content\` to retrieve full stored content from earlier search/fetch results.
- Use \`web_bookmark\` for bookmark and web-history management.
- If you are unsure about syntax, run \`sero help web_search\`, \`sero help fetch_content\`, etc.

**Browser automation (Computer Use)**
- \`automation_browser\` controls a hidden Chromium automation browser inside the runtime via agent-browser.
- Use it for known pages/apps only: runtime UI testing, interaction flows, visual bug reproduction, snapshots, screenshots, and headless automation recordings.
- Do NOT use \`automation_browser\` for user-facing website browsing, visible Browser-panel work, Sero app screen recordings, generic web search, routine page/content retrieval, downloads, or bookmark management.
- For visible browser UI or user-requested screen recordings, use \`sero-cli\`: \`sero browser show\`, \`sero browser goto <url>\`, then \`sero app record start|stop\`. Run \`app record stop\` separately after waiting 3-5s for the final browser page to render.
- Typical hidden automation flow: start the app → \`automation_browser launch\` / \`navigate\` → \`snapshot\` → interact → \`screenshot\` → verify → \`close\`.
- The visible Sero preview pane is separate from the hidden automation browser; verify automation-browser actions using its screenshots, text extraction, snapshot output, and evaluate results.
- Use the container IP for URLs, not localhost.
- Use \`snapshot\`, \`get_text\`, \`evaluate\`, and \`wait\` for assertions and dynamic pages.
- Coordinate clicks use viewport-relative CSS pixels, not document coordinates. If you derive coordinates from the DOM, use the center of \`getBoundingClientRect()\` directly and do not add/subtract scroll offsets.
- If coordinates are outside the current viewport, scroll the element into view first or use selector click instead.
- Always take screenshots after key interactions as evidence.
- Automation-browser recordings auto-stop after 120 seconds as a safety limit; stop them explicitly sooner when you only need a short clip.

**Autonomous verification**
- For runtime UI testing: build/start the app, verify with \`automation_browser\`, capture screenshots, and save artifacts with \`sero-cli artifacts save\`.
- For test work: run tests, fix failures, rerun until passing, then capture final evidence.
- Prefer demos over diffs: prove the result works.`;
}

export function buildHostPromptBlock(
  workspaceId: string,
  workspacePath: string,
  opts?: { platform?: NodeJS.Platform },
): string {
  const platform = opts?.platform ?? process.platform;
  const piDocs = getHostPiDocsPaths();
  return `

## Host Runtime Environment

You are operating on the host runtime for workspace "${workspaceId}".
Workspace root: ${workspacePath}.
Use relative paths from the workspace root unless the task explicitly needs another workspace.
Use \`sero-cli\` with \`workspace access-roots --json\` when you need the bounded list of additional roots, folder mounts, linked plugins, or referenced workspaces.

**Pi/Sero self-building documentation fallback**
- If the default Pi documentation paths in the base prompt are missing or point into an inaccessible package/asar location, use the shared Sero docs copy instead.
- Main documentation: \`${piDocs.readme}\`
- Additional docs: \`${piDocs.docs}\`
- Examples, when bundled: \`${piDocs.examples}\`
- When asked about Pi/Sero SDK, extensions, themes, skills, prompt templates, TUI, keybindings, models, packages, or custom providers, read these docs first.

**Command hygiene**
- Do NOT hard-code PATH prefixes like \`PATH=/usr/local/bin:/opt/homebrew/...:$PATH\`. Sero already prepares managed Node/npm/pnpm/git/bash on PATH for tool calls.
- Prefer project scripts over ad-hoc binaries: use \`npm run typecheck\`, \`pnpm run typecheck\`, or \`npm run build\` when package.json defines them.
- Before running JS/TS checks in a new or changed project, inspect package.json and run the matching install command if node_modules is missing.
- For React + TypeScript projects, include \`@types/react\`, \`@types/react-dom\`, and \`vite-env.d.ts\` before running \`tsc\`. This avoids predictable missing JSX/declaration errors.
- Avoid bare \`npx tsc --noEmit\` unless the project has TypeScript dependencies installed and no package script exists.

**Dev servers**
- When starting a dev server, use the actual URL printed by that server. If Vite says \`Port 5173 is in use\` and moves to another port, register and report the new port.
- In Sero development builds, \`localhost:5173\` is often Sero's own renderer. Do not register it for user preview apps unless that is explicitly the app you started.
- Verify host previews with \`curl -I http://127.0.0.1:<port>\` before reporting the URL.

Host platform: ${platform}.`;
}
