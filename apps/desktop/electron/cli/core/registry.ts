import type { CliCommand, CliCommandContext, CliResolvedCommand } from './types';

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

export class CliRegistry {
  private commands = new Map<string, CliCommand>();

  register(command: CliCommand): void {
    const name = normalizeName(command.name);
    if (!name) throw new Error('CLI command name is required');

    const root = name.split(' ')[0];
    if (root && BLACKLISTED_ROOTS.has(root)) {
      throw new Error(`CLI command root is blacklisted: ${root}`);
    }

    this.commands.set(name, { ...command, name });
  }

  get(name: string): CliCommand | undefined {
    return this.commands.get(normalizeName(name));
  }

  list(): CliCommand[] {
    return [...this.commands.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  findHelpTarget(query: string): CliCommand | undefined {
    const normalized = normalizeName(query);
    if (!normalized) return undefined;
    const exact = this.get(normalized);
    if (exact) return exact;

    const tokens = normalized.split(' ');
    for (let len = tokens.length - 1; len >= 1; len--) {
      const candidate = tokens.slice(0, len).join(' ');
      const hit = this.get(candidate);
      if (hit) return hit;
    }

    return undefined;
  }

  resolveTokens(tokens: string[]): CliResolvedCommand {
    const normalizedTokens = [...tokens];
    if (normalizedTokens[0] === 'sero') normalizedTokens.shift();
    if (normalizedTokens.length === 0) {
      throw new Error('No command provided');
    }

    for (let len = normalizedTokens.length; len >= 1; len--) {
      const name = normalizedTokens.slice(0, len).join(' ');
      const command = this.commands.get(name);
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
