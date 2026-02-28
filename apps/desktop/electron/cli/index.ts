import type { LoadExtensionsResult } from '@mariozechner/pi-coding-agent';
import { registerAppStateCliCommands } from './commands/appstate';
import { registerArtifactCliCommands } from './commands/artifacts';
import { registerDevServerCliCommands } from './commands/devserver';
import { registerEditorCliCommands } from './commands/editor';
import { registerGoogleCliCommands } from './commands/google';
import { registerSessionCliCommands } from './commands/session';
import { registerTerminalCliCommands } from './commands/terminal';
import { registerVcsCliCommands } from './commands/vcs';
import { registerWorkspaceCliCommands } from './commands/workspace';
import { registerHelpCliCommand } from './help';
import { CliRegistry } from './registry';
import { bridgeCommand, bridgeTool } from './schema-bridge';
import { createSeroCliTool } from './tool';

let registry: CliRegistry | null = null;

function registerCoreCommands(target: CliRegistry): void {
  registerWorkspaceCliCommands(target);
  registerSessionCliCommands(target);
  registerVcsCliCommands(target);
  registerDevServerCliCommands(target);
  registerArtifactCliCommands(target);
  registerEditorCliCommands(target);
  registerAppStateCliCommands(target);
  registerTerminalCliCommands(target);
  registerGoogleCliCommands(target);
  registerHelpCliCommand(target);
}

export function getCliRegistry(): CliRegistry {
  if (!registry) {
    registry = new CliRegistry();
    registerCoreCommands(registry);
  }
  return registry;
}

export function createWorkspaceCliTool(workspaceId: string, sessionId: string) {
  return createSeroCliTool(getCliRegistry(), workspaceId, sessionId);
}

// ── Extension tool → CLI bridge ─────────────────────────────

/**
 * Tools to migrate from agent context into CLI commands.
 * Add a tool name here to move it from the agent's tool list into
 * the `sero-cli` help — zero per-tool code needed.
 */
/**
 * Extension tools to collapse into the single `sero-cli` tool.
 * Every app/extension tool should be listed here — only core coding
 * tools (bash, read, write, edit, browser) and tools that depend on
 * SDK internals (ctx.sessionManager) remain as standalone tools.
 *
 * DO NOT bridge tools that use ctx.sessionManager, ctx.getContextUsage,
 * or other SDK context — the CLI bridge only passes { cwd }.
 */
const TOOLS_TO_BRIDGE = new Set([
  // Data & productivity
  'todo',
  'notes',
  'calc',
  'daily_quote',
  'weight',
  // Google
  'gmail',
  'gcal',
  // Media & services
  'generate_image',
  'spotify',
  'starling',
  // Planning & context
  'plan_todos',
  'slopzilla',
  // User interaction
  'question',
  'questionnaire',
  'interview',
  // NOT bridged — these depend on ctx.sessionManager (SDK internals):
  // 'context_tag', 'context_log', 'context_checkout'
]);

/**
 * Sero built-in commands (registered by the sero extension factory).
 * These are NOT bridged to CLI — they either already have CLI equivalents
 * or are pure UI/session management that the agent shouldn't invoke.
 */
const BUILTIN_COMMANDS = new Set([
  'workspace', 'pwd',
  'reload', 'compact', 'name', 'session', 'model', 'thinking',
  'checkpoint', 'checkpoints', 'restore', 'diffcp',
]);

/**
 * `extensionsOverride` callback for DefaultResourceLoader.
 *
 * After all extensions load:
 * 1. Finds tools listed in TOOLS_TO_BRIDGE, wraps each into a CLI
 *    command, and removes it from the extension tool list.
 * 2. Finds extension commands (slash commands) NOT in BUILTIN_COMMANDS,
 *    wraps each into a CLI command so the agent can invoke them.
 *    Commands stay registered in extensions (user can still type /plan).
 */
export function bridgeExtensionTools(base: LoadExtensionsResult): LoadExtensionsResult {
  const reg = getCliRegistry();

  for (const ext of base.extensions) {
    // Bridge tools → CLI (removes from agent tool list)
    for (const [name, registered] of [...ext.tools]) {
      if (!TOOLS_TO_BRIDGE.has(name)) continue;
      if (reg.get(name)) {
        ext.tools.delete(name);
        continue;
      }
      const command = bridgeTool(name, registered.definition);
      reg.register(command);
      ext.tools.delete(name);
    }

    // Bridge commands → CLI (keeps in extension for user slash commands)
    for (const [name, registered] of ext.commands) {
      if (BUILTIN_COMMANDS.has(name)) continue;
      if (reg.get(name)) continue;
      reg.register(bridgeCommand(name, registered));
    }
  }

  return base;
}

// ── System prompt block ─────────────────────────────────────

/**
 * Build the CLI system prompt dynamically from registered commands.
 *
 * Groups commands by source and lists them all, so the agent discovers
 * every bridged app tool automatically — no manual prompt updates needed.
 */
export function buildCliPromptBlock(): string {
  const reg = getCliRegistry();
  const commands = reg.list().filter((c) => !c.hidden && c.name !== 'help');

  // Group by source label
  const grouped = new Map<string, string[]>();
  for (const cmd of commands) {
    const group = cmd.group ?? 'Other';
    const list = grouped.get(group) ?? [];
    list.push(`  sero ${cmd.name.padEnd(22)} ${cmd.summary}`);
    grouped.set(group, list);
  }

  const sections: string[] = [];
  for (const [group, lines] of [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    sections.push(`  ${group}:`, ...lines);
  }

  return `

## Sero CLI

You have access to the \`sero-cli\` tool for Sero platform operations.
Use it instead of asking the user to do platform actions manually.

Available commands:
${sections.join('\n')}

Run \`sero help <command>\` for detailed usage of any command.

Chain commands (one per line):
  sero todo list
  sero notes add "Summary" --body "..."
`;
}
