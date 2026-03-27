import { appStateManager } from '../../../features/apps/state/manager';
import type { CliRegistry } from '../../core/registry';
import type { CliCommandContext } from '../../core/types';
import { fail, ok, parseFlags, requireFlagString, stringifyJson } from '../../lib/utils';

async function handleAppState(args: string[], _ctx: CliCommandContext) {
  const [action, ...rest] = args;

  try {
    switch (action) {
      case 'read': {
        const filePath = rest[0];
        if (!filePath) return fail('Usage: sero appstate read <path>');
        return ok(stringifyJson(await appStateManager.read(filePath)));
      }

      case 'write': {
        const filePath = rest[0];
        if (!filePath) return fail('Usage: sero appstate write <path> --json <value>');
        const { flags } = parseFlags(rest.slice(1));
        const json = requireFlagString(flags, 'json');
        if (!json) return fail('Missing --json payload');
        await appStateManager.write(filePath, JSON.parse(json));
        return ok(`Wrote app state: ${filePath}`);
      }

      default:
        return fail('Usage: sero appstate <read|write> ...');
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'App state command failed';
    return fail(message);
  }
}

export function registerAppStateCliCommands(registry: CliRegistry): void {
  registry.register({
    name: 'appstate',
    summary: 'Read or write app state JSON files',
    help:
      'appstate — App state JSON helpers\n\n' +
      'Usage: sero appstate <action> [args]\n\n' +
      'Actions:\n' +
      '  read <path>\n' +
      '  write <path> --json <json>\n',
    source: 'ipc',
    group: 'App State',
    execute: handleAppState,
  });
}
