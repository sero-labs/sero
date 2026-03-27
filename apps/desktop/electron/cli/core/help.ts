import type { CliRegistry } from './registry';
import type { CliCommandContext } from './types';
import { fail, ok } from '../lib/utils';

function groupLabel(group?: string): string {
  return (group ?? 'Other').toUpperCase();
}

export function renderCliHelpList(registry: CliRegistry): string {
  const commands = registry.list().filter((c) => !c.hidden);
  const grouped = new Map<string, typeof commands>();

  for (const cmd of commands) {
    const key = groupLabel(cmd.group);
    const list = grouped.get(key) ?? [];
    list.push(cmd);
    grouped.set(key, list);
  }

  const sections: string[] = ['Sero CLI — Platform commands for the Sero agent'];
  for (const [group, list] of [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    sections.push('', group);
    for (const cmd of list.sort((a, b) => a.name.localeCompare(b.name))) {
      sections.push(`  ${cmd.name.padEnd(18)} ${cmd.summary}`);
    }
  }

  sections.push('', 'Run `sero help <command>` for detailed usage.');
  return sections.join('\n');
}

export function renderCliCommandHelp(registry: CliRegistry, query: string): string | null {
  const cmd = registry.findHelpTarget(query);
  if (!cmd) return null;
  if (cmd.help?.trim()) return cmd.help.trim();

  const lines = [`${cmd.name} — ${cmd.summary}`];
  if (cmd.params?.length) {
    lines.push('', 'Parameters:');
    for (const p of cmd.params) {
      lines.push(`  ${p.name}${p.required ? ' (required)' : ''} — ${p.description}`);
    }
  }
  return lines.join('\n');
}

export function registerHelpCliCommand(registry: CliRegistry): void {
  registry.register({
    name: 'help',
    summary: 'Show available commands and usage',
    help:
      'help — Show CLI help\n\n' +
      'Usage:\n' +
      '  sero help\n' +
      '  sero help <command>\n',
    source: 'builtin',
    group: 'Builtin',
    execute: async (args: string[], _ctx: CliCommandContext) => {
      if (!args.length) return ok(renderCliHelpList(registry));
      const output = renderCliCommandHelp(registry, args.join(' '));
      if (!output) return fail(`Unknown command: ${args.join(' ')}`);
      return ok(output);
    },
  });
}
