import { promises as fs } from 'node:fs';
import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Text } from '@earendil-works/pi-tui';
import { Type } from 'typebox';

import { resolveArchitectPaths } from '../shared/paths';
import { normalizeIndex, type ArchitectIndex } from '../shared/types';

async function readIndex(): Promise<ArchitectIndex> {
  try {
    const raw = await fs.readFile(resolveArchitectPaths().indexFile, 'utf8');
    return normalizeIndex(JSON.parse(raw));
  } catch {
    return normalizeIndex(null);
  }
}

function formatIndex(index: ArchitectIndex): string {
  if (index.projects.length === 0) return 'No Architect projects yet.';
  return index.projects
    .map((p) => {
      const state = p.overlay ? `${p.phase} · ${p.overlay}` : p.phase;
      const spend = p.capUsd === null ? `$${p.spentUsd.toFixed(2)}` : `$${p.spentUsd.toFixed(2)} of $${p.capUsd}`;
      const needs = p.needsYou ? ` · needs you: ${p.needsYou}` : '';
      return `${p.name} (${p.id}) [${state}] ${spend}${needs}\n  ${p.stateLine}`;
    })
    .join('\n');
}

const Params = Type.Object({
  action: StringEnum(['list'] as const),
});

type SeroCliTool<T> = T & {
  cli: {
    summary: string;
    help: string;
    group: string;
    execute(args: readonly string[], context: { cwd?: string }, signal?: AbortSignal): Promise<{ output: string; exitCode: number }>;
  };
};

export default function (pi: ExtensionAPI) {
  // The management tool. Skeleton scope: list only. Create, pause, resume,
  // stop, raise cap, set autonomy, answer, directive and delete land with the
  // record store, since each of them writes the record the runtime owns.
  const projectsTool: SeroCliTool<ToolDefinition<typeof Params>> = {
    name: 'architect_projects',
    label: 'Architect projects',
    description: 'Manage Sero Architect projects. Actions: list.',
    parameters: Params,

    async execute() {
      return { content: [{ type: 'text', text: formatIndex(await readIndex()) }], details: {} };
    },

    renderCall(args, theme) {
      return new Text(theme.fg('toolTitle', theme.bold('architect_projects ')) + theme.fg('muted', args.action), 0, 0);
    },

    renderResult(result, _options, theme) {
      const first = result.content[0];
      return new Text(theme.fg('muted', first?.type === 'text' ? first.text : ''), 0, 0);
    },

    cli: {
      summary: 'Manage Sero Architect projects',
      help: 'sero architect_projects <list>',
      group: 'Apps',
      async execute(args) {
        const [subcommand] = args;
        if (!subcommand || subcommand === 'list') return { output: formatIndex(await readIndex()), exitCode: 0 };
        return { output: `Unknown subcommand: ${subcommand}`, exitCode: 1 };
      },
    },
  };

  pi.registerTool(projectsTool);
}
