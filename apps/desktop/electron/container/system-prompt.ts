/**
 * Container-aware system prompt additions.
 *
 * Appended to the system prompt via the Sero extension's before_agent_start
 * hook when the workspace has an active container.
 */

/**
 * Build the container context block for injection into the system prompt.
 * Returns the block to append, or null if there's no container info to add.
 */
export function buildContainerPromptBlock(
  workspaceId: string,
  containerIp?: string,
): string {
  return `

## Container Environment

You are operating inside a sandboxed Linux container for workspace "${workspaceId}".
Your workspace directory is /workspace — all project files live here.

**Container details:**
- Base image: node:22-slim (Debian-based)
- Full root access inside the container
- Network access for installing packages
- Available tools: git, curl, wget, node, npm, python3, ss, netstat, dig, ps, less, jq
${containerIp ? `- Container IP: ${containerIp} (accessible from the host)` : ''}

**Cross-workspace access:**
- Other open workspaces (including the global workspace) are mounted into this container at their original host paths.
- You CAN read and write files using their absolute host paths (e.g. /Users/.../workspaces/global/MEMORY.md).
- This means cross-workspace operations like saving memories to the global workspace work normally — use the paths shown in the Open Workspaces section.

**CRITICAL — Dev servers and networking:**
- Dev servers MUST bind to 0.0.0.0, not localhost/127.0.0.1, so they are accessible from the host.
  - Vite: ALWAYS pass \`--host 0.0.0.0 --port 3000\` (e.g. \`npx vite --host 0.0.0.0 --port 3000\`)
  - Next.js: \`next dev -H 0.0.0.0 -p 3000\`
  - Express/Node: \`.listen(3000, '0.0.0.0')\`
- Dev servers are accessed via the container IP (${containerIp ?? '<container-ip>'}), NOT localhost.
  After each bash command, the tool output shows all detected server URLs — always tell
  the user the exact URL shown there (e.g. http://${containerIp ?? '<container-ip>'}:3000).
- Any port is fine. Container servers never conflict with host services.

**CRITICAL — Starting background / long-running processes:**
Each bash tool call runs in an isolated \`sh -c\` shell. To start a process that must outlive the command:
1. ALWAYS use \`setsid\` to detach from the parent session:
   \`setsid sh -c 'cd /workspace/myapp && npx vite --host 0.0.0.0 --port 3000 > /tmp/vite.log 2>&1 &'\`
2. Redirect stdout/stderr to a log file.
3. After starting, verify the port is listening with \`ss -tlnp | grep <port>\`.
4. If verification fails, check the log file for errors.
5. NEVER use bare \`command &\` without \`setsid\` — the process will become a zombie.
6. NEVER use \`kill -9 -1\` — it kills ALL processes in the container.
7. To stop a server, use \`pkill -f 'vite'\` or \`kill <PID>\`.

**CRITICAL — Registering dev servers:**
After successfully starting a dev server and confirming it is listening (via \`ss -tlnp\`),
you MUST call the \`register_dev_server\` tool to register it with the host. This lets the
user see the server in the Dev Servers panel (status bar) and stop/restart it from the UI.
Example:
  1. Start the server: \`setsid sh -c 'npx vite --host 0.0.0.0 --port 3000 > /tmp/vite.log 2>&1 &'\`
  2. Verify: \`ss -tlnp | grep 3000\`
  3. Register: call \`register_dev_server\` with name, port, command, and framework

**Terminal awareness:**
- The user may have interactive terminal sessions running in this container.
- Use \`read_terminal\` to check terminal output for errors after starting dev servers.
- If you see errors, proactively fix them.`;
}
