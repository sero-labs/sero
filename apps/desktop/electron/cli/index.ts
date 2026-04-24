import type { LoadExtensionsResult } from '@mariozechner/pi-coding-agent';
import {
  registerAppControlCliCommands,
  registerAppStateCliCommands,
  registerArtifactCliCommands,
} from './commands/apps';
import {
  registerDevServerCliCommands,
  registerTerminalCliCommands,
} from './commands/container';
import { registerEditorCliCommands } from './commands/editor';
import { registerSessionCliCommands } from './commands/agent';
import { registerVcsCliCommands } from './commands/vcs';
import { registerWorkspaceCliCommands } from './commands/workspace';
import {
  registerHelpCliCommand,
  CliRegistry,
  bridgeCommand,
  bridgeTool,
  createSeroCliTool,
  getCustomToolCliBridge,
  type CliCommand,
  type CliAppCommandOwner,
} from './core';
import {
  clearBridgedExtensionSessionItems,
  clearBridgedExtensionSessionItemsForSession,
  replaceBridgedExtensionSessionItems,
} from './bridges/extension-session-bridge';
import { clearPluginBridgePolicyCache, getPluginBridgePolicy } from '../features/plugins/bridge-policy';

let registry: CliRegistry | null = null;

/** @internal Test helper: reset the singleton registry between tests. */
export function resetCliRegistryForTests(): void {
  registry = null;
  clearPluginBridgePolicyCache();
  clearBridgedExtensionSessionItems();
}

function registerCoreCommands(target: CliRegistry): void {
  registerAppControlCliCommands(target);
  registerWorkspaceCliCommands(target);
  registerSessionCliCommands(target);
  registerVcsCliCommands(target);
  registerDevServerCliCommands(target);
  registerArtifactCliCommands(target);
  registerEditorCliCommands(target);
  registerAppStateCliCommands(target);
  registerTerminalCliCommands(target);
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
 * Core tools to always bridge into the single `sero-cli` tool.
 * Every app/extension tool should be listed here — only core coding
 * tools (bash, read, write, edit, browser) and tools that depend on
 * unavailable SDK internals remain as standalone tools.
 *
 * Bridged tools receive `{ cwd }`, forwarded agent context, and a narrow
 * execution-scoped `sessionRuntime` for current-session side effects.
 */
const CORE_TOOLS_TO_BRIDGE = new Set([
  // Data & productivity
  'todo',
  'notes',
  'calc',
  'daily_quote',
  'weight',
  'memory',
  'memory_search',
  'scratchpad',
  // Media & services
  'generate_image',
  'spotify',
  'starling',
  // Planning & context
  'plan_todos',
  'slopzilla',
  // Agent management
  'create_agent',
  // User input — interactive (timeout-exempt via INTERACTIVE_TOOLS)
  'question',
  'questionnaire',
  'interview',
  // Scheduling
  'current_time',
  'cron',
  'reminder',
  // Text tools
  'humanize',
  // Git
  'git_manager',
  // NOT bridged — private, kept away from agent by design:
  // 'admin' — Sero Admin reads sensitive config (auth, .env); must not be agent-accessible
  // NOT bridged — deliberate standalone exception for nested structured params:
  // 'subagent'
]);

/**
 * Tool names that must NEVER be bridged into `sero-cli`.
 *
 * Only tools that genuinely cannot work through the CLI bridge belong here:
 * - `research` — external skill with its own streaming/timeout model
 *
 * User-interactive tools (question, questionnaire, interview) are now bridged
 * with `interactive: true` which disables the per-command timeout.
 */
const NEVER_BRIDGE_TO_CLI = new Set([
  'research',
]);

/**
 * Tools that block on user input and need indefinite wait time.
 * Bridged into sero-cli with `interactive: true` (timeout-exempt).
 */
const INTERACTIVE_TOOLS = new Set([
  'question',
  'questionnaire',
  'interview',
]);

/**
 * Check whether a tool should be bridged to CLI.
 *
 * Core built-in tools still use the static allowlist above. Plugins are
 * manifest-driven: any extension loaded from a package with `sero.plugin`
 * opts into bridging via `sero.plugin.bridgeTools`.
 *
 * - `undefined` / `true` → bridge all tools from that plugin extension
 * - `false`              → bridge none
 * - `string[]`           → bridge only the listed tool names
 */
function shouldBridgeTool(name: string, extensionPath: string): boolean {
  if (NEVER_BRIDGE_TO_CLI.has(name)) return false;
  if (CORE_TOOLS_TO_BRIDGE.has(name)) return true;

  const pluginPolicy = getPluginBridgePolicy(extensionPath);
  if (!pluginPolicy) return false;

  return pluginPolicy.bridgeAll || pluginPolicy.toolNames.has(name);
}

export function clearBridgedExtensionSessionStateForSession(sessionId: string): void {
  clearBridgedExtensionSessionItemsForSession(sessionId);
  registry?.removeAppCommandsForSession(sessionId);
}

export {
  clearPluginBridgePolicyCache,
};

/**
 * Sero built-in commands (registered by the sero extension factory).
 * These are NOT bridged to CLI — they either already have CLI equivalents
 * or are pure UI/session management that the agent shouldn't invoke.
 */
const BUILTIN_COMMANDS = new Set([
  'workspace', 'pwd',
  'reload', 'compact', 'name', 'session', 'model', 'thinking',
  'checkpoint', 'checkpoints', 'restore', 'diffcp',
  'admin',
]);

/**
 * `extensionsOverride` callback for DefaultResourceLoader.
 *
 * After all extensions load:
 * 1. Finds tools allowed by the core allowlist or plugin manifest policy,
 *    wraps each into a CLI command, and removes it from the extension tool list.
 * 2. Finds extension commands (slash commands) NOT in BUILTIN_COMMANDS,
 *    wraps each into a CLI command so the agent can invoke them.
 *    Commands stay registered in extensions (user can still type /plan).
 */
export function bridgeExtensionTools(
  base: LoadExtensionsResult,
  options?: { sessionId?: string },
): LoadExtensionsResult {
  const reg = getCliRegistry();
  const sessionCommands: CliCommand[] = [];

  if (options?.sessionId) {
    replaceBridgedExtensionSessionItems(options.sessionId, base.extensions);
  }

  for (const ext of base.extensions) {
    const owner: CliAppCommandOwner | null = options?.sessionId
      ? {
          kind: 'session-extension',
          sessionId: options.sessionId,
          extensionPath: ext.resolvedPath,
        }
      : null;
    const bridgedToolNames = new Set<string>();

    // Bridge tools → CLI (removes from agent tool list)
    for (const [name, registered] of [...ext.tools]) {
      if (!shouldBridgeTool(name, ext.resolvedPath)) continue;

      const existing = reg.get(name, owner ? { sessionId: options?.sessionId } : undefined);
      const cliBridge = getCustomToolCliBridge(registered.definition);
      const canOverrideBuiltin = existing?.source === 'builtin' && cliBridge?.overrideBuiltin === true;

      if (existing && existing.source !== 'app' && !canOverrideBuiltin) {
        ext.tools.delete(name);
        continue;
      }

      const command = bridgeTool(name, registered.definition, {
        interactive: INTERACTIVE_TOOLS.has(name),
      });
      if (owner) {
        sessionCommands.push({ ...command, owner });
      } else {
        reg.register(command);
      }
      bridgedToolNames.add(name);
      ext.tools.delete(name);
    }

    // Bridge commands → CLI (keeps in extension for user slash commands)
    for (const [name, registered] of ext.commands) {
      if (BUILTIN_COMMANDS.has(name) || bridgedToolNames.has(name)) continue;
      const existing = reg.get(name, owner ? { sessionId: options?.sessionId } : undefined);
      if (existing && existing.source !== 'app') continue;

      const command = bridgeCommand(name, registered.description);
      if (owner) {
        sessionCommands.push({ ...command, owner });
      } else {
        reg.register(command);
      }
    }
  }

  if (options?.sessionId) {
    reg.replaceAppCommandsForSession(options.sessionId, sessionCommands);
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
export function buildCliPromptBlock(
  reg: CliRegistry = getCliRegistry(),
  scope?: { workspaceId?: string; sessionId?: string | null },
): string {
  const commands = reg.list(scope).filter((c) => !c.hidden && c.name !== 'help');

  // Group commands and include per-command summaries
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
**Before calling any command that takes JSON parameters (e.g. \`question\`, \`questionnaire\`, \`interview\`), run \`sero help <command>\` first to check the exact schema.**

For \`sero app\`, skip help for common flows.
- Screenshot directly: \`sero app screenshot --app "<name or id>" [--save <path>]\`
- Names resolve too (\`Calculator\` → \`calc\`); use \`sero app list\` only if ambiguous.
- \`appstate\` is JSON state only, not UI automation.
- Use \`app click <selector>\` or \`app click --x <n> --y <n>\`; no \`app press\`.
`;
}
