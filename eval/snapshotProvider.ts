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
import path from 'node:path';
import type { ApiProvider, ProviderResponse } from 'promptfoo';
import { setupTempDir, teardownTempDir } from './setup';
import { captureSessionSnapshot } from './helpers/sessionSnapshot';

const DEFAULT_AGENT_DIR =
  process.env.SERO_AGENT_DIR ?? `${process.env.HOME}/.sero-ui/agent`;

/** Monorepo root — one level up from eval/ */
const SERO_ROOT = path.resolve(__dirname, '..');

/**
 * Unwrap CJS/ESM interop: tsx wraps TS modules under .default when
 * loaded via dynamic import(). This normalizes to the real exports.
 */
function unwrapDefault(mod: any): any {
  // If the module only has a 'default' key and default is an object,
  // the real named exports live inside it.
  if (mod?.default && typeof mod.default === 'object') {
    return mod.default;
  }
  return mod;
}

interface SnapshotProviderConfig {
  agentDir?: string;
  /** Simulate container mode (adds container prompt block) */
  containerMode?: boolean;
  /** Simulated container IP */
  containerIp?: string;
  /** Simulated workspace ID */
  workspaceId?: string;
}

/**
 * Build the CLI system prompt dynamically from registered commands.
 * This is a copy of the pure logic from cli/index.ts, avoiding the
 * Electron-dependent imports that live in the same file.
 */
function buildCliPromptBlock(registry: { list(): Array<{ name: string; summary: string; group?: string; hidden?: boolean }> }): string {
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
      const sdk = await import('@mariozechner/pi-coding-agent');

      const authStorage = sdk.AuthStorage.create(`${agentDir}/auth.json`);
      const modelRegistry = new sdk.ModelRegistry(
        authStorage,
        `${agentDir}/models.json`,
      );
      const settingsManager = sdk.SettingsManager.create(agentDir, agentDir);

      const loader = new sdk.DefaultResourceLoader({
        cwd: tmpDir,
        agentDir,
        settingsManager,
      });
      await loader.reload();

      const { session } = await sdk.createAgentSession({
        cwd: tmpDir,
        agentDir,
        authStorage,
        modelRegistry,
        tools: [],
        customTools: [],
        resourceLoader: loader,
        sessionManager: sdk.SessionManager.inMemory(),
        settingsManager,
      });

      // Capture SDK base state
      const baseSnapshot = captureSessionSnapshot(session);

      // ── 2. Assemble Sero prompt blocks ─────────────────────────
      // Import pure prompt-building functions using absolute paths
      // resolved from the monorepo root.
      let cliBlock = '';
      let containerBlock = '';
      let subagentBlock = '';

      try {
        const containerPromptPath = path.join(
          SERO_ROOT, 'apps/desktop/electron/features/container/tools/system-prompt.ts'
        );
        const { buildContainerPromptBlock } = unwrapDefault(await import(containerPromptPath));
        if (this.config.containerMode) {
          containerBlock = buildContainerPromptBlock(
            this.config.workspaceId ?? 'eval-workspace',
            this.config.containerIp ?? '172.17.0.2',
          );
        }
      } catch (e) {
        containerBlock = `<!-- container prompt import failed: ${(e as Error).message} -->`;
      }

      try {
        const subagentPromptPath = path.join(
          SERO_ROOT, 'apps/desktop/electron/features/subagent/extensions/prompt.ts'
        );
        const { buildSubagentPromptBlock } = unwrapDefault(await import(subagentPromptPath));
        subagentBlock = buildSubagentPromptBlock();
      } catch (e) {
        subagentBlock = `<!-- subagent prompt import failed: ${(e as Error).message} -->`;
      }

      try {
        // Import CliRegistry from core/registry (pure — no Electron deps).
        // buildCliPromptBlock is inlined above because cli/index.ts imports
        // Electron-dependent command registrations.
        const registryPath = path.join(
          SERO_ROOT, 'apps/desktop/electron/cli/core/registry.ts'
        );
        const { CliRegistry } = unwrapDefault(await import(registryPath));
        const registry = new CliRegistry();
        const noop = async () => ({ output: '', exitCode: 0 });

        // Register the same core commands that registerCoreCommands() does
        const coreCommands = [
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
        // Bridged extension tools (these come from plugins in a real session)
        const bridgedTools = [
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
          { name: 'scratchpad', summary: 'Working notes', group: 'Apps' },
          { name: 'calc', summary: 'Calculator', group: 'Apps' },
          { name: 'gmail', summary: 'Gmail integration', group: 'Apps' },
          { name: 'gcal', summary: 'Google Calendar', group: 'Apps' },
          { name: 'git_manager', summary: 'Git management', group: 'Apps' },
          { name: 'humanize', summary: 'Humanize text', group: 'Apps' },
        ];

        for (const cmd of [...coreCommands, ...bridgedTools]) {
          registry.register({
            name: cmd.name,
            summary: cmd.summary,
            group: cmd.group,
            source: cmd.group === 'Apps' ? 'app' : 'builtin',
            execute: noop,
          });
        }

        cliBlock = buildCliPromptBlock(registry);
      } catch (e) {
        cliBlock = `<!-- CLI prompt import failed: ${(e as Error).message} -->`;
      }

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
