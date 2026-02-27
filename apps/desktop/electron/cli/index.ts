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
import { bridgeTool } from './schema-bridge';
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
const TOOLS_TO_BRIDGE = new Set([
  'todo',
  'notes',
  'calc',
  'daily_quote',
  'weight',
  'gmail',
  'gcal',
]);

/**
 * `extensionsOverride` callback for DefaultResourceLoader.
 *
 * After all extensions load, finds tools listed in TOOLS_TO_BRIDGE,
 * wraps each into a CLI command (generic schema-driven parsing), and
 * removes it from the extension so it no longer appears in the agent's
 * tool context.
 */
export function bridgeExtensionTools(base: LoadExtensionsResult): LoadExtensionsResult {
  const reg = getCliRegistry();

  for (const ext of base.extensions) {
    for (const [name, registered] of [...ext.tools]) {
      if (!TOOLS_TO_BRIDGE.has(name)) continue;
      // Skip if already registered (e.g. from a previous reload)
      if (reg.get(name)) {
        ext.tools.delete(name);
        continue;
      }
      const command = bridgeTool(name, registered.definition);
      reg.register(command);
      ext.tools.delete(name);
    }
  }

  return base;
}

// ── System prompt block ─────────────────────────────────────

export function buildCliPromptBlock(): string {
  return `

## Sero CLI

You have access to the \`sero-cli\` tool for Sero platform operations.
Use it instead of asking the user to do platform actions manually.

Quick reference (run \`sero help\` for full list):
  sero todo list
  sero notes list
  sero workspace info
  sero vcs status
  sero devserver list
  sero gmail search --query "newer_than:3d"
  sero gcal today
  sero google auth list
  sero google gmail search 'newer_than:1d'
  sero google calendar events primary --today

Chain commands (one per line):
  sero todo list
  sero notes add "Summary" --body "..."
`;
}
