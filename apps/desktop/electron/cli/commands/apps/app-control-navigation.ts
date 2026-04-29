import { stringifyJson, ok, fail, parseFlags, requireFlagString } from '@electron/cli/lib/utils';
import { appControlHostService } from '@electron/features/apps/app-control/host-service';
import {
  isResolvedAppResult,
  listApps,
  openResolvedApp,
  resolveApp,
} from './app-control-shared';

export async function handleList() {
  const apps = await listApps();
  if (apps.length === 0) return ok('No apps available.');
  const lines = apps.map((app) => {
    const scope = app.scope ? ` (${app.scope})` : '';
    const ui = app.hasUI ? '' : ' [no UI]';
    return `  ${app.id.padEnd(16)} ${app.name}${scope}${ui}`;
  });
  return ok(`Available apps:\n${lines.join('\n')}`);
}

export async function handleOpen(args: string[]) {
  const query = args[0];
  if (!query) return fail('Usage: sero app open <appId>');
  const opened = await openResolvedApp(query);
  if (!isResolvedAppResult(opened)) return opened;
  return ok(`Switched to app: ${opened.entry.name} (${opened.entry.id})`);
}

export async function handleActive() {
  const active = await appControlHostService.active();
  return ok(`Active app: ${active}`);
}

export async function handleInfo(args: string[]) {
  const query = args[0];
  if (!query) return fail('Usage: sero app info <appId>');
  const match = await resolveApp(query);
  if (!match) return fail(`App "${query}" not found.`);
  const info = await appControlHostService.info(match.id);
  return ok(stringifyJson(info ?? match));
}

export async function handlePreview(args: string[]) {
  const { positionals, flags } = parseFlags(args);
  const url = positionals[0] ?? requireFlagString(flags, 'url');
  if (!url) return fail('Usage: sero app preview <url>\n  e.g. sero app preview http://192.168.64.5:3000');
  const success = await appControlHostService.openDevPreview(url);
  return success
    ? ok(`Dev server preview opened in editor: ${url}\nThe preview is now capturable via \`sero app record\` and \`sero app screenshot\`.`)
    : fail('Failed to open dev server preview.');
}
