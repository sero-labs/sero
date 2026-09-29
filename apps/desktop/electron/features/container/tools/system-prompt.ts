/**
 * Container-aware system prompt additions.
 *
 * Appended to the system prompt via the Sero extension's before_agent_start
 * hook when the workspace has an active container.
 */

import { getHostPiDocsPaths, getRuntimePiDocsPaths } from '@electron/features/pi-docs/shared-pi-docs';

/**
 * Build the container context block for injection into the system prompt.
 *
 * Facts about the image come from `apps/desktop/images/Dockerfile.sero-node`.
 * The block leaves out anything the CLI block, the memory block or a tool's own
 * output already says.
 */
export function buildContainerPromptBlock(
  workspaceId: string,
  containerIp?: string,
  opts?: { currentWorkingDir?: string; cliReachable?: boolean; shellReachable?: boolean },
): string {
  const currentWorkingDir = opts?.currentWorkingDir ?? '/workspace';
  const cwdNote = currentWorkingDir === '/workspace'
    ? 'Your current working directory is also /workspace.'
    : `Your current working directory for this session is ${currentWorkingDir}.`;
  const piDocs = getRuntimePiDocsPaths();
  // A session with no `sero-cli` cannot run the commands this block would name.
  const cliReachable = opts?.cliReachable ?? true;
  // A read-only subagent has no `bash`, so it cannot start or check a server.
  const shellReachable = opts?.shellReachable ?? true;
  const serverAddress = containerIp
    ? `- Reach a server at the container IP (${containerIp}), not localhost.\n`
    : '';
  const shellGuidance = shellReachable ? `**Dev servers**
- Bind servers to \`0.0.0.0\`, not localhost or 127.0.0.1. Vite: \`npx vite --host 0.0.0.0 --port 3000\`. Next.js: \`next dev -H 0.0.0.0 -p 3000\`. Express: \`.listen(3000, '0.0.0.0')\`.
${serverAddress}- The bash tool output shows the server URLs it detected. Tell the user the exact URL shown there.
- Check that a server is running before you say it is.
${cliReachable ? '- Once a server is listening, register it with \`sero devserver register\` so it appears in the Dev Servers UI.\n' : ''}
**Background processes**
Each bash call runs in its own \`sh -c\` shell.
- Start anything that must outlive the command with \`setsid\` and redirect its output to a log file, for example \`setsid sh -c 'cd ${currentWorkingDir}/myapp && npx vite --host 0.0.0.0 --port 3000 > /tmp/vite.log 2>&1 &'\`.
- Check startup with \`ss -tlnp | grep <port>\`. If it failed, read the log.
- Never use a bare \`command &\` without \`setsid\`, and never \`kill -9 -1\`. Stop a server with \`pkill -f ...\` or \`kill <PID>\`.
${cliReachable ? '- The user may have terminal sessions open in this container. After you start a server, run \`sero terminal read\` to check its output and fix errors.\n' : ''}
` : '';

  return `

## Container Environment

You are in a sandboxed Linux container for workspace "${workspaceId}". The image is Ubuntu 24.04 with Node 24. You have root access and network access.
Workspace root: /workspace.
${cwdNote}
Prefer relative paths and keep work in the current working directory unless the task needs another location.
If this session is in a git worktree subdirectory, do NOT reset yourself with \`cd /workspace\` before making changes.
Other open workspaces are mounted at their original host paths. Use those paths only for a different workspace${cliReachable ? ', and run \`sero workspace access-roots --json\` for the exact roots this session may read' : ''}.

${shellGuidance}Host-side Sero logs are mounted read-only under \`/workspace/.sero/logs\`. Start with \`/workspace/.sero/logs/README.md\`.
Pi docs: \`${piDocs.root}\``;
}

export function buildHostPromptBlock(
  workspaceId: string,
  workspacePath: string,
  opts?: { platform?: NodeJS.Platform; devBuild?: boolean; cliReachable?: boolean },
): string {
  const platform = opts?.platform ?? process.platform;
  const piDocs = getHostPiDocsPaths();
  const cliReachable = opts?.cliReachable ?? true;
  // In a source build, Sero's own renderer answers on this port.
  const rendererNote = opts?.devBuild
    ? '\n- `localhost:5173` is often Sero\'s own renderer. Do not register it for a user preview unless that is the app you started.'
    : '';
  return `

## Host Runtime Environment

You are operating on the host runtime for workspace "${workspaceId}".
Workspace root: ${workspacePath}.
Use relative paths from the workspace root unless the task needs another workspace.
${cliReachable ? 'Run \`sero workspace access-roots --json\` for the bounded list of additional roots, folder mounts, linked plugins, or referenced workspaces.\n' : ''}Do NOT hard-code PATH prefixes like \`PATH=/usr/local/bin:/opt/homebrew/...:$PATH\`. Sero already prepares managed Node, npm, pnpm, git and bash on PATH for tool calls.

**Dev servers**
- Use the actual URL the server prints. If Vite says \`Port 5173 is in use\` and moves to another port, register and report the new port.
${cliReachable ? '- Once a server is listening, register it with \`sero devserver register\`.' : ''}${rendererNote}

Host platform: ${platform}.
Pi docs: \`${piDocs.root}\``;
}
