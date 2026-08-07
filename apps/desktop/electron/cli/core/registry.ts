import { getCliSessionBridge } from '../bridges/session-bridge';
import type {
  CliAppCommandOwner,
  CliCommand,
  CliCommandContext,
  CliResolvedCommand,
} from './types';

const BLACKLISTED_ROOTS = new Set([
  'auth',
  'safeStorage',
  'net',
  'layout',
  'agent',
  'github',
]);

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

function ownerKey(owner: CliAppCommandOwner): string {
  return `${owner.sessionId}:${owner.extensionPath}`;
}

function assertAllowedCommandName(name: string): void {
  if (!name) throw new Error('CLI command name is required');

  const root = name.split(/[ /]/, 1)[0];
  if (root && BLACKLISTED_ROOTS.has(root)) {
    throw new Error(`CLI command root is blacklisted: ${root}`);
  }
}

interface AppOwnerCommands {
  owner: CliAppCommandOwner;
  commands: Map<string, CliCommand>;
}

export interface CliRegistryScope {
  workspaceId?: string;
  sessionId?: string | null;
}

function resolveScopedSessionId(scope?: CliRegistryScope): string | null | undefined {
  if (!scope) return undefined;
  if (scope.sessionId) return scope.sessionId;
  if (!scope.workspaceId) return null;

  try {
    return getCliSessionBridge().getActiveSessionForWorkspace(scope.workspaceId)?.sessionId ?? null;
  } catch {
    return null;
  }
}

export class CliRegistry {
  private commands = new Map<string, CliCommand>();
  private agentPluginCommands = new Map<string, CliCommand>();
  private agentPluginCommandProvider: (() => CliCommand[]) | null = null;
  private appOwnerCommands = new Map<string, AppOwnerCommands>();

  register(command: CliCommand): void {
    const name = normalizeName(command.name);
    assertAllowedCommandName(name);
    this.commands.set(name, { ...command, name });
  }

  replaceAppCommandsForSession(sessionId: string, commands: CliCommand[]): void {
    this.removeAppCommandsForSession(sessionId);

    for (const command of commands) {
      const owner = command.owner;
      if (!owner || owner.sessionId !== sessionId) {
        throw new Error(`CLI app command missing owner metadata for session ${sessionId}`);
      }

      const key = ownerKey(owner);
      const existing = this.appOwnerCommands.get(key) ?? {
        owner,
        commands: new Map<string, CliCommand>(),
      };
      const name = normalizeName(command.name);
      assertAllowedCommandName(name);
      existing.commands.set(name, { ...command, name });
      this.appOwnerCommands.set(key, existing);
    }
  }

  replaceAgentPluginCommands(commands: CliCommand[]): void {
    this.agentPluginCommands = this.normalizeAgentPluginCommands(commands);
  }

  setAgentPluginCommandProvider(provider: () => CliCommand[]): void {
    this.agentPluginCommandProvider = provider;
    this.refreshAgentPluginCommands();
  }

  refreshAgentPluginCommands(): void {
    if (this.agentPluginCommandProvider) {
      this.agentPluginCommands = this.normalizeAgentPluginCommands(this.agentPluginCommandProvider());
    }
  }

  private normalizeAgentPluginCommands(commands: CliCommand[]): Map<string, CliCommand> {
    const next = new Map<string, CliCommand>();
    for (const command of commands) {
      const name = normalizeName(command.name);
      assertAllowedCommandName(name);
      if (this.commands.has(name)) throw new Error(`Agent Plugin CLI command collides with a Sero command: ${name}`);
      if (next.has(name)) throw new Error(`Agent Plugin CLI command collision: ${name}`);
      next.set(name, { ...command, name, source: 'agent-plugin' });
    }
    return next;
  }

  removeAppCommandsForSession(sessionId: string): void {
    for (const [key, value] of [...this.appOwnerCommands.entries()]) {
      if (value.owner.sessionId === sessionId) {
        this.appOwnerCommands.delete(key);
      }
    }
  }

  private buildVisibleCommands(scope?: CliRegistryScope): Map<string, CliCommand> {
    this.refreshAgentPluginCommands();
    const visible = new Map([...this.commands, ...this.agentPluginCommands]);
    const scopedSessionId = resolveScopedSessionId(scope);

    for (const ownerCommands of this.appOwnerCommands.values()) {
      if (scope && ownerCommands.owner.sessionId !== scopedSessionId) {
        continue;
      }

      for (const [name, command] of ownerCommands.commands) {
        if (this.agentPluginCommands.has(name)) {
          throw new Error(`CLI app command collides with an Agent Plugin command: ${name}`);
        }
        visible.set(name, command);
      }
    }
    return visible;
  }

  get(name: string, scope?: CliRegistryScope): CliCommand | undefined {
    return this.buildVisibleCommands(scope).get(normalizeName(name));
  }

  list(scope?: CliRegistryScope): CliCommand[] {
    return [...this.buildVisibleCommands(scope).values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  findHelpTarget(query: string, scope?: CliRegistryScope): CliCommand | undefined {
    const normalized = normalizeName(query);
    if (!normalized) return undefined;
    const exact = this.get(normalized, scope);
    if (exact) return exact;

    const tokens = normalized.split(' ');
    for (let len = tokens.length - 1; len >= 1; len--) {
      const candidate = tokens.slice(0, len).join(' ');
      const hit = this.get(candidate, scope);
      if (hit) return hit;
    }

    return undefined;
  }

  resolveTokens(tokens: string[], scope?: CliRegistryScope): CliResolvedCommand {
    const normalizedTokens = [...tokens];
    if (normalizedTokens[0] === 'sero') normalizedTokens.shift();
    if (normalizedTokens.length === 0) {
      throw new Error('No command provided');
    }

    const visibleCommands = this.buildVisibleCommands(scope);
    for (let len = normalizedTokens.length; len >= 1; len--) {
      const name = normalizedTokens.slice(0, len).join(' ');
      const command = visibleCommands.get(name);
      if (command) {
        return {
          command,
          args: normalizedTokens.slice(len),
          tokens: normalizedTokens,
        };
      }
    }

    throw new Error(`Unknown command: ${normalizedTokens.join(' ')}`);
  }

  executeResolved(
    resolved: CliResolvedCommand,
    args: string[],
    context: CliCommandContext,
    onUpdate?: Parameters<CliCommand['execute']>[2],
  ) {
    return resolved.command.execute(args, context, onUpdate);
  }
}
