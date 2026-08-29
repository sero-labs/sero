/**
 * Sero session snapshot provider — captures the FULL system prompt and
 * tool list as assembled by Sero's session setup, NOT just the SDK base.
 *
 * Assembles the real prompt by calling the same pure functions that
 * create-sero-extension.ts calls during before_agent_start:
 *   1. SDK base system prompt (from createAgentSession)
 *   2. CLI prompt block (buildCliPromptBlock — lists all sero-cli commands)
 *   3. Container prompt block (buildContainerPromptBlock — environment context)
 *   4. Subagent prompt block (buildSubagentPromptBlock — delegation guidance)
 *
 * No LLM calls, no API key needed. Runs in ~2 seconds.
 */
import type { ApiProvider, ProviderResponse } from 'promptfoo';
import { setupTempDir, teardownTempDir } from './setup';
import { captureSessionSnapshot } from './helpers/sessionSnapshot';

const DEFAULT_AGENT_DIR =
  process.env.SERO_AGENT_DIR ?? `${process.env.HOME}/.sero-ui/agent`;

interface SnapshotProviderConfig {
  agentDir?: string;
  /** Simulate container mode (adds container prompt block) */
  containerMode?: boolean;
  /** Simulated container IP */
  containerIp?: string;
  /** Simulated workspace ID */
  workspaceId?: string;
}

interface PromptCommand {
  name: string;
  summary: string;
  group?: string;
  hidden?: boolean;
}

/**
 * These helpers intentionally inline the pure prompt builders from the
 * Electron codebase. Promptfoo loads this provider through tsx, but when we
 * run promptfoo under Electron's Node runtime the absolute `.ts` dynamic
 * imports used here are not loader-aware and fail with "Unknown file
 * extension '.ts'". Keeping tiny pure copies here preserves snapshot fidelity
 * while making the eval runner runtime-agnostic.
 */
const BLACKLISTED_ROOTS = new Set([
  'auth',
  'safeStorage',
  'net',
  'layout',
  'agent',
  'github',
]);

function normalizeCommandName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

class SnapshotCliRegistry {
  private commands = new Map<string, PromptCommand>();

  register(command: PromptCommand): void {
    const name = normalizeCommandName(command.name);
    if (!name) {
      throw new Error('CLI command name is required');
    }

    const root = name.split(' ')[0];
    if (root && BLACKLISTED_ROOTS.has(root)) {
      throw new Error(`CLI command root is blacklisted: ${root}`);
    }

    this.commands.set(name, { ...command, name });
  }

  list(): PromptCommand[] {
    return [...this.commands.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }
}

function buildContainerPromptBlock(
  workspaceId: string,
  containerIp?: string,
  opts?: { currentWorkingDir?: string },
): string {
  const currentWorkingDir = opts?.currentWorkingDir ?? '/workspace';
  const cwdNote =
    currentWorkingDir === '/workspace'
      ? 'Your current working directory is also /workspace.'
      : `Your current working directory for this session is ${currentWorkingDir}.`;

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

**Web search, fetching, and downloads**
- For normal web tasks, prefer the Sero web tools exposed through \`sero-cli\`.
- Use \`web_search\` for web search and current information lookup.
- Use \`fetch_content\` for article/page retrieval, content extraction, and file downloads.
- Use \`get_search_content\` to retrieve full stored content from earlier search/fetch results.
- Use \`web_bookmark\` for bookmark and web-history management.
- If you are unsure about syntax, run \`sero help web_search\`, \`sero help fetch_content\`, etc.

**Browser automation (Computer Use)**
- \`browser\` controls a headless Chromium browser inside the container via Playwright.
- Use it for known pages/apps only: UI testing, interaction flows, visual bug reproduction, screenshots, and recordings.
- Do NOT use \`browser\` for generic web search, routine page/content retrieval, downloads, or bookmark management.
- Typical flow: start the app → \`browser launch\` / \`navigate\` → interact → \`screenshot\` → verify → \`close\`.
- Use the container IP for URLs, not localhost.
- Use \`get_text\`, \`evaluate\`, and \`wait\` for assertions and dynamic pages.
- Always take screenshots after key interactions as evidence.

**Autonomous verification**
- For UI work: build/start the app, verify with \`browser\`, capture screenshots, and save artifacts with \`sero-cli artifacts save\`.
- For test work: run tests, fix failures, rerun until passing, then capture final evidence.
- Prefer demos over diffs: prove the result works.`;
}

function buildSubagentPromptBlock(): string {
  return `

## Subagents

Use the \`subagent\` tool to delegate substantial independent work to specialist agents.
Each subagent gets a fresh context window and full workspace access.

Use subagents when:
- work can be split into independent parallel pieces
- you want specialist analysis, review, or testing
- a subtask would benefit from a clean context window

Do NOT use subagents for:
- quick file reads or simple lookups
- tasks that require back-and-forth with the user
- work that would take fewer than ~5 tool calls

Prefer named agents for recurring roles and inline \`systemPrompt\` for one-off tasks.
Subagents cannot spawn further subagents or call \`create_agent\`.
When running tasks in parallel, give each one independent file scope to avoid races.
`;
}

/**
 * Build the CLI system prompt dynamically from registered commands.
 * This is a copy of the pure logic from cli/index.ts, avoiding the
 * Electron-dependent imports that live in the same file.
 */
function buildCliPromptBlock(registry: { list(): PromptCommand[] }): string {
  const commands = registry.list().filter((c) => !c.hidden && c.name !== 'help');

  const grouped = new Map<string, Array<{ name: string; summary: string }>>();
  for (const cmd of commands) {
    const group = cmd.group ?? 'Other';
    const list = grouped.get(group) ?? [];
    list.push({ name: cmd.name, summary: cmd.summary });
    grouped.set(group, list);
  }

  const sections = [...grouped.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([group, cmds]) => {
      const lines = cmds
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => `  ${c.name} — ${c.summary}`);
      return `${group}:\n${lines.join('\n')}`;
    });

  return `

## Sero CLI

Use \`sero-cli\` for Sero platform actions instead of asking the user to do them manually.

${sections.join('\n')}

Run \`sero help <command>\` for details. Chain multiple commands (one per line).
**Before calling any command that takes JSON parameters (e.g. \`question\`, \`questionnaire\`, \`interview\`, \`kanban\`), run \`sero help <command>\` first to check the exact schema.**

For \`sero app\`: run \`sero help app\` first. Use \`app click <selector>\` or \`app click --x <n> --y <n>\` (coordinates relative to the active app screenshot). \`app type\` only works for text inputs/contenteditable. No \`app press\` command — use coordinate clicks.
`;
}

export default class SnapshotProvider implements ApiProvider {
  private config: SnapshotProviderConfig;

  constructor(opts: { config?: SnapshotProviderConfig; id?: string } = {}) {
    this.config = opts.config ?? {};
  }

  id(): string {
    return 'sero:snapshot';
  }

  async callApi(_prompt: string): Promise<ProviderResponse> {
    const agentDir = this.config.agentDir ?? DEFAULT_AGENT_DIR;
    const tmpDir = await setupTempDir();

    try {
      // ── 1. Get the SDK base prompt ─────────────────────────────
      const sdk = await import('@earendil-works/pi-coding-agent');

      const modelRuntime = await sdk.ModelRuntime.create({
        authPath: `${agentDir}/auth.json`,
        modelsPath: `${agentDir}/models.json`,
      });
      const settingsManager = sdk.SettingsManager.create(tmpDir, agentDir);

      const loader = new sdk.DefaultResourceLoader({
        cwd: tmpDir,
        agentDir,
        settingsManager,
      });
      await loader.reload();

      const { session } = await sdk.createAgentSession({
        cwd: tmpDir,
        agentDir,
        modelRuntime,
        tools: [],
        customTools: [],
        resourceLoader: loader,
        sessionManager: sdk.SessionManager.inMemory(),
        settingsManager,
      });

      // Capture SDK base state
      const baseSnapshot = captureSessionSnapshot(session);

      // ── 2. Assemble Sero prompt blocks ─────────────────────────
      let cliBlock = '';
      let containerBlock = '';
      const subagentBlock = buildSubagentPromptBlock();

      if (this.config.containerMode) {
        containerBlock = buildContainerPromptBlock(
          this.config.workspaceId ?? 'eval-workspace',
          this.config.containerIp ?? '172.17.0.2',
        );
      }

      const registry = new SnapshotCliRegistry();

      // Register the same core commands that registerCoreCommands() does.
      const coreCommands: PromptCommand[] = [
        { name: 'workspace', summary: 'Manage workspaces', group: 'Builtin' },
        { name: 'session', summary: 'Session commands', group: 'Builtin' },
        { name: 'vcs', summary: 'Git/VCS operations', group: 'Builtin' },
        { name: 'capture', summary: 'Capture app screenshot', group: 'Apps' },
        { name: 'dev-server', summary: 'Dev server control', group: 'Builtin' },
        { name: 'terminal', summary: 'Terminal management', group: 'Builtin' },
        { name: 'editor', summary: 'Code editor operations', group: 'Builtin' },
        { name: 'artifacts', summary: 'Manage artifacts', group: 'Builtin' },
        { name: 'google', summary: 'Google services', group: 'Builtin' },
      ];

      // Bridged extension tools (these come from plugins in a real session).
      const bridgedTools: PromptCommand[] = [
        { name: 'todo', summary: 'Manage todos', group: 'Apps' },
        { name: 'notes', summary: 'Manage notes', group: 'Apps' },
        { name: 'memory', summary: 'Long-term memory', group: 'Apps' },
        { name: 'memory_search', summary: 'Search memory', group: 'Apps' },
        { name: 'kanban', summary: 'Kanban board', group: 'Apps' },
        { name: 'cron', summary: 'Scheduled tasks', group: 'Apps' },
        { name: 'reminder', summary: 'Set reminders', group: 'Apps' },
        { name: 'current_time', summary: 'Current time', group: 'Apps' },
        { name: 'spotify', summary: 'Spotify control', group: 'Apps' },
        { name: 'generate_image', summary: 'Generate images', group: 'Apps' },
        { name: 'question', summary: 'Ask user a question', group: 'Apps' },
        { name: 'calc', summary: 'Calculator', group: 'Apps' },
        { name: 'gmail', summary: 'Gmail integration', group: 'Apps' },
        { name: 'gcal', summary: 'Google Calendar', group: 'Apps' },
        { name: 'git_manager', summary: 'Git management', group: 'Apps' },
        { name: 'humanize', summary: 'Humanize text', group: 'Apps' },
      ];

      for (const command of [...coreCommands, ...bridgedTools]) {
        registry.register(command);
      }

      cliBlock = buildCliPromptBlock(registry);

      // ── 3. Assemble the full Sero prompt ───────────────────────
      // This mirrors create-sero-extension.ts before_agent_start handler:
      //   systemPrompt += buildCliPromptBlock()
      //   systemPrompt += buildContainerPromptBlock(...)  // if container
      //   systemPrompt += buildSubagentPromptBlock()      // if main session
      const fullPrompt =
        baseSnapshot.systemPrompt + cliBlock + containerBlock + subagentBlock;

      // Build the final snapshot with Sero's full prompt
      const crypto = require('node:crypto');
      const hash = (s: string) =>
        crypto.createHash('sha256').update(s).digest('hex');

      const snapshot = {
        systemPrompt: fullPrompt,
        sdkBasePrompt: baseSnapshot.systemPrompt,
        cliBlock,
        containerBlock,
        subagentBlock,
        toolNames: baseSnapshot.toolNames,
        tools: baseSnapshot.tools,
        systemPromptHash: hash(fullPrompt),
        toolListHash: baseSnapshot.toolListHash,
        systemPromptLength: fullPrompt.length,
        sdkBasePromptLength: baseSnapshot.systemPrompt.length,
        cliBlockLength: cliBlock.length,
        containerBlockLength: containerBlock.length,
        subagentBlockLength: subagentBlock.length,
      };

      const output = [
        `Full Sero prompt: ${snapshot.systemPromptLength} chars (hash: ${snapshot.systemPromptHash.slice(0, 12)})`,
        `  SDK base: ${snapshot.sdkBasePromptLength} chars`,
        `  CLI block: ${snapshot.cliBlockLength} chars`,
        `  Container block: ${snapshot.containerBlockLength} chars`,
        `  Subagent block: ${snapshot.subagentBlockLength} chars`,
        `Tools (${snapshot.toolNames.length}): ${snapshot.toolNames.join(', ') || '(lazy-loaded on first prompt)'}`,
      ].join('\n');

      return {
        output,
        metadata: {
          ...snapshot,
          toolCount: snapshot.toolNames.length,
        },
      };
    } catch (err: any) {
      return { error: `Snapshot error: ${err.message}` };
    } finally {
      await teardownTempDir(tmpDir);
    }
  }
}
