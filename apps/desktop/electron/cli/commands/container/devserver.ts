import { runtimeManager } from '@electron/features/workspace/runtime/runtime-manager';
import { containerManager } from '@electron/shared/infra/shared-infra';
import type { CliRegistry } from '@electron/cli/core/registry';
import type { CliCommandContext } from '@electron/cli/core/types';
import { fail, ok, parseFlags, requireFlagString } from '@electron/cli/lib/utils';

async function handleDevServer(args: string[], ctx: CliCommandContext) {
  const [action, ...rest] = args;
  const registry = containerManager.devServers;

  try {
    switch (action) {
      case 'list': {
        const servers = runtimeManager.listDevServersSync(ctx.workspaceId);
        if (servers.length === 0) return ok('No registered dev servers.');
        return ok(
          servers
            .map((s) => `${s.id} [${s.status}] ${s.name} — ${s.url} (port ${s.port})`)
            .join('\n'),
        );
      }

      case 'register': {
        const { positionals, flags } = parseFlags(rest);
        const name = requireFlagString(flags, 'name') ?? positionals[0];
        const portRaw = requireFlagString(flags, 'port') ?? positionals[1];
        const command = requireFlagString(flags, 'command') ?? positionals.slice(2).join(' ');
        const framework = requireFlagString(flags, 'framework') ?? undefined;

        if (!name || !portRaw || !command) {
          return fail('Usage: sero devserver register --name <name> --port <port> --command <cmd> [--framework <name>]');
        }
        const port = Number(portRaw);
        if (!Number.isFinite(port)) return fail(`Invalid port: ${portRaw}`);

        const runtime = await runtimeManager.getRuntime(ctx.workspaceId);
        const server = runtime.registerDevServer
          ? await runtime.registerDevServer({ name, port, command, framework, cwd: ctx.cwd })
          : registry.register({ workspaceId: ctx.workspaceId, name, port, command, framework, cwd: ctx.cwd });
        return ok(`Registered ${server.name} (${server.id})\nURL: ${server.url}`);
      }

      case 'stop': {
        const serverId = rest[0];
        if (!serverId) return fail('Usage: sero devserver stop <id>');
        try {
          const runtime = await runtimeManager.getRuntime(ctx.workspaceId);
          await runtime.stopDevServer({ serverId });
        } catch {
          const stopped = await registry.stop(serverId);
          if (!stopped) return fail(`Failed to stop dev server: ${serverId}`);
        }
        return ok(`Stopped dev server: ${serverId}`);
      }

      default:
        return fail('Usage: sero devserver <list|register|stop>');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Dev server command failed';
    return fail(message);
  }
}

export function registerDevServerCliCommands(registry: CliRegistry): void {
  registry.register({
    name: 'devserver',
    summary: 'Manage dev servers (list, register, stop)',
    help:
      'devserver — Dev server registry\n\n' +
      'Usage: sero devserver <action> [args]\n\n' +
      'Actions:\n' +
      '  list\n' +
      '  register --name <name> --port <port> --command <cmd> [--framework <name>]\n' +
      '  stop <id>\n',
    source: 'ipc',
    group: 'Dev Servers',
    execute: handleDevServer,
  });
}
