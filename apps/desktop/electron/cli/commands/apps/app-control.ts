/**
 * CLI commands for agent app control.
 *
 * All commands are under the `sero app` namespace and go through the
 * sero-cli bridge (AD-020) — zero additional tool schema tokens.
 */

import { BrowserWindow } from 'electron';
import { copyFile, cp as copyTree, lstat, mkdir as mkdirFs, writeFile } from 'fs/promises';
import pathMod from 'path';
import type { CliRegistry } from '../../core/registry';
import type { CliCommandContext, CliResult } from '../../core/types';
import { fail, ok, parseFlags, requireFlagString, stringifyJson } from '../../lib/utils';
import type {
  AppControlEntry,
  AppInteractionParams,
  AppInteractionResult,
  AppPanelRect,
  AppRecordingStatus,
  AppRecordingResult,
} from '../../../../src/types/ipc';
import { captureRegion } from '../../../shared/media/capture';
import { prepareToolImage } from '../../../shared/media/image-resize';
import { resolveAppTarget } from './app-control-target';

// ── Helpers ──────────────────────────────────────────────────

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null;
}

async function exec<T>(code: string): Promise<T> {
  const win = getMainWindow();
  if (!win) throw new Error('No main window available');
  return win.webContents.executeJavaScript(code) as Promise<T>;
}

async function captureAppScreenshot(): Promise<{ base64: string; rect: AppPanelRect } | null> {
  const win = getMainWindow();
  if (!win) return null;
  const rect = await exec<AppPanelRect | null>('window.__appControl?.getAppRect() ?? null');
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  const base64 = await captureRegion(win, rect);
  if (!base64) return null;
  return { base64, rect };
}

function okWithImage(
  summary: string,
  base64: string,
  mimeType = 'image/png',
  details?: CliResult['details'],
): CliResult {
  const image = prepareToolImage(base64, mimeType, summary);
  return {
    output: image.text ?? summary,
    exitCode: 0,
    content: [
      ...(image.text ? [{ type: 'text' as const, text: image.text }] : []),
      { type: 'image' as const, data: image.data, mimeType: image.mimeType },
    ],
    details,
  };
}

async function resolveApp(query: string): Promise<AppControlEntry | null> {
  const apps = await exec<AppControlEntry[]>('window.__appControl?.getList() ?? []');
  return resolveAppTarget(apps, query);
}

function getFramesDirPath(targetPath: string): string {
  const parsed = pathMod.parse(targetPath);
  return pathMod.extname(targetPath)
    ? pathMod.join(parsed.dir, `${parsed.name}-frames`)
    : targetPath;
}

async function copyRecordingOutput(srcPath: string, destPath: string): Promise<void> {
  const srcStat = await lstat(srcPath);
  if (srcStat.isDirectory()) {
    await copyTree(srcPath, destPath, { force: true, recursive: true });
    return;
  }
  await copyFile(srcPath, destPath);
}

type ParsedFlags = ReturnType<typeof parseFlags>['flags'];

function parseFiniteFlagValue(value: string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCoordinateFlags(
  flags: ParsedFlags,
  usage: string,
): { x: number; y: number } | CliResult | null {
  const xStr = requireFlagString(flags, 'x');
  const yStr = requireFlagString(flags, 'y');

  if ((xStr && !yStr) || (!xStr && yStr)) {
    return fail(usage);
  }
  if (!xStr || !yStr) return null;

  const x = parseFiniteFlagValue(xStr);
  const y = parseFiniteFlagValue(yStr);
  if (x == null || y == null) {
    return fail('--x and --y must be finite numbers.');
  }

  return { x, y };
}

function parseAmountFlag(flags: ParsedFlags): number | CliResult {
  const amountStr = requireFlagString(flags, 'amount');
  if (!amountStr) return 300;
  const amount = parseFiniteFlagValue(amountStr);
  return amount == null ? fail('--amount must be a finite number.') : amount;
}

function isCliResult(value: CliResult | { x: number; y: number }): value is CliResult {
  return 'exitCode' in value;
}

// ── Main Router ──────────────────────────────────────────────

async function handleApp(args: string[], ctx: CliCommandContext) {
  const [action, ...rest] = args;
  switch (action) {
    case 'list': return handleList();
    case 'open': return handleOpen(rest);
    case 'active': return handleActive();
    case 'info': return handleInfo(rest);
    case 'screenshot': return handleScreenshot(rest, ctx);
    case 'click': return handleClick(rest);
    case 'type': return handleType(rest);
    case 'scroll': return handleScroll(rest);
    case 'select': return handleSelect(rest);
    case 'hover': return handleHover(rest);
    case 'inspect': return handleInspect(rest);
    case 'get-text': return handleGetText(rest);
    case 'record': return handleRecord(rest, ctx);
    case 'preview': return handlePreview(rest);
    default:
      return fail('Usage: sero app <list|open|active|info|screenshot|click|type|scroll|select|hover|inspect|get-text|record|preview>');
  }
}

// ── Navigation ───────────────────────────────────────────────

async function handleList() {
  const apps = await exec<AppControlEntry[]>('window.__appControl?.getList() ?? []');
  if (apps.length === 0) return ok('No apps available.');
  const lines = apps.map((a) => {
    const scope = a.scope ? ` (${a.scope})` : '';
    const ui = a.hasUI ? '' : ' [no UI]';
    return `  ${a.id.padEnd(16)} ${a.name}${scope}${ui}`;
  });
  return ok(`Available apps:\n${lines.join('\n')}`);
}

async function handleOpen(args: string[]) {
  const query = args[0];
  if (!query) return fail('Usage: sero app open <appId>');
  const match = await resolveApp(query);
  if (!match) {
    const apps = await exec<AppControlEntry[]>('window.__appControl?.getList() ?? []');
    return fail(`App "${query}" not found. Use an app id or visible name. Available: ${apps.map((a) => a.id).join(', ')}`);
  }
  const success = await exec<boolean>(`window.__appControl?.openApp(${JSON.stringify(match.id)}) ?? false`);
  if (!success) return fail(`Failed to open app "${match.name}" (${match.id}).`);
  return ok(`Switched to app: ${match.name} (${match.id})`);
}

async function handleActive() {
  const active = await exec<string>('window.__appControl?.getActive() ?? "unknown"');
  return ok(`Active app: ${active}`);
}

async function handleInfo(args: string[]) {
  const query = args[0];
  if (!query) return fail('Usage: sero app info <appId>');
  const match = await resolveApp(query);
  if (!match) return fail(`App "${query}" not found.`);
  const info = await exec<AppControlEntry | null>(`window.__appControl?.getInfo(${JSON.stringify(match.id)}) ?? null`);
  return ok(stringifyJson(info ?? match));
}

// ── Screenshots ──────────────────────────────────────────────

async function handleScreenshot(args: string[], ctx: CliCommandContext) {
  const { flags } = parseFlags(args);
  const targetApp = requireFlagString(flags, 'app');
  const savePath = requireFlagString(flags, 'save');

  let targetEntry: AppControlEntry | null = null;
  if (targetApp) {
    targetEntry = await resolveApp(targetApp);
    if (!targetEntry) return fail(`App "${targetApp}" not found. Use an app id or visible name.`);
    const success = await exec<boolean>(`window.__appControl?.openApp(${JSON.stringify(targetEntry.id)}) ?? false`);
    if (!success) return fail(`Failed to open app "${targetEntry.name}" (${targetEntry.id}).`);
    await new Promise((r) => setTimeout(r, 500));
  }
  const capture = await captureAppScreenshot();
  if (!capture) return fail('Screenshot failed — app panel not found or not visible.');

  const { base64, rect } = capture;
  const appLabel = targetEntry?.name ?? targetApp ?? 'active';
  const description = `Screenshot of ${appLabel} app (${Math.round(rect.width)}×${Math.round(rect.height)} CSS px). For app click --x/--y, use coordinates relative to this image from the top-left corner.`;

  if (savePath) {
    const absPath = pathMod.isAbsolute(savePath) ? savePath : pathMod.join(ctx.cwd, savePath);
    await mkdirFs(pathMod.dirname(absPath), { recursive: true });
    await writeFile(absPath, Buffer.from(base64, 'base64'));
    return okWithImage(
      `${description}\nSaved: ${absPath} (${Math.round(base64.length * 0.75 / 1024)}KB)`,
      base64,
      'image/png',
      { savedPath: absPath, appId: targetEntry?.id ?? null },
    );
  }

  return okWithImage(description, base64, 'image/png', { appId: targetEntry?.id ?? null });
}

// ── Interaction ──────────────────────────────────────────────

async function handleClick(args: string[]) {
  const { positionals, flags } = parseFlags(args);
  const selector = positionals[0] ?? null;
  const pointResult = parseCoordinateFlags(flags, 'Usage: sero app click <selector> OR sero app click --x <n> --y <n>');
  if (pointResult && isCliResult(pointResult)) return pointResult;
  const point = pointResult ?? null;

  const params: AppInteractionParams = { action: 'click' };
  if (selector) params.selector = selector;
  else if (point) {
    params.x = point.x;
    params.y = point.y;
  } else {
    return fail('Usage: sero app click <selector> OR sero app click --x <n> --y <n>');
  }
  return interactAndReturn(params);
}

async function handleType(args: string[]) {
  const { positionals, flags } = parseFlags(args);
  const text = positionals[0];
  if (!text) return fail('Usage: sero app type "<text>" [--selector <sel>]');
  return interactAndReturn({
    action: 'type', text,
    selector: requireFlagString(flags, 'selector') ?? undefined,
  });
}

async function handleScroll(args: string[]) {
  const { flags } = parseFlags(args);
  const direction = (requireFlagString(flags, 'direction') ?? 'down') as AppInteractionParams['direction'];
  const amount = parseAmountFlag(flags);
  if (typeof amount !== 'number') return amount;

  return interactAndReturn({
    action: 'scroll',
    direction,
    amount,
    selector: requireFlagString(flags, 'selector') ?? undefined,
  });
}

async function handleSelect(args: string[]) {
  if (!args[0]) return fail('Usage: sero app select <selector>');
  return interactAndReturn({ action: 'select', selector: args[0] });
}

async function handleHover(args: string[]) {
  if (!args[0]) return fail('Usage: sero app hover <selector>');
  return interactAndReturn({ action: 'hover', selector: args[0] });
}

async function handleInspect(args: string[]) {
  const { positionals, flags } = parseFlags(args);
  const selector = positionals[0] ?? requireFlagString(flags, 'selector') ?? undefined;
  const pointResult = parseCoordinateFlags(flags, 'Usage: sero app inspect [<selector>] [--x <n> --y <n>]');
  if (pointResult && isCliResult(pointResult)) return pointResult;
  const point = pointResult ?? null;
  if (selector && point) {
    return fail('Use either a selector or --x/--y coordinates for inspect, not both.');
  }

  const params: AppInteractionParams = { action: 'inspect', captureAfter: false };
  if (selector) params.selector = selector;
  else if (point) {
    params.x = point.x;
    params.y = point.y;
  }
  return interactAndReturn(params);
}

async function handleGetText(args: string[]) {
  const { flags } = parseFlags(args);
  const selector = requireFlagString(flags, 'selector') ?? args[0] ?? undefined;
  const result = await exec<AppInteractionResult>(
    `window.__appControl?.interact(${JSON.stringify({ action: 'get-text', selector, captureAfter: false })})`,
  );
  if (!result.success) return fail(result.message);
  return ok(result.textContent ?? '(empty)');
}

// ── Recording ────────────────────────────────────────────────

async function handleRecord(args: string[], ctx: CliCommandContext) {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'start': {
      const win = getMainWindow();
      if (!win) return fail('No main window.');
      const ok_ = await win.webContents.executeJavaScript('window.sero.appControl.recordStart()') as boolean;
      return ok_ ? ok('Recording started (2 FPS frame capture). Use `sero app record stop` to save as MP4.') : fail('Already recording or app panel not found.');
    }
    case 'stop': {
      const win = getMainWindow();
      if (!win) return fail('No main window.');
      const result = await win.webContents.executeJavaScript('window.sero.appControl.recordStop()') as AppRecordingResult | null;
      if (!result) {
        return fail('Recording stop failed — no active recording or no frames were captured.');
      }

      const { flags } = parseFlags(rest);
      const savePath = requireFlagString(flags, 'save');

      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const workspacePath = ctx.workspaceManager.getPath(ctx.workspaceId) ?? ctx.cwd;
      const defaultDir = pathMod.join(workspacePath, 'sero-recordings');
      const requestedPath = savePath
        ? (pathMod.isAbsolute(savePath) ? savePath : pathMod.join(ctx.cwd, savePath))
        : null;
      const destPath = result.isVideo
        ? (requestedPath ?? pathMod.join(defaultDir, `recording-${ts}.mp4`))
        : (requestedPath
          ? getFramesDirPath(requestedPath)
          : pathMod.join(defaultDir, `recording-${ts}-frames`));

      await mkdirFs(pathMod.dirname(destPath), { recursive: true });
      await copyRecordingOutput(result.path, destPath);
      const format = result.isVideo ? 'MP4' : 'PNG frames';
      const dur = Math.round(result.durationMs / 1000);
      return ok(`Recording saved: ${destPath} (${format}, ${result.frameCount} frames, ${dur}s)`);
    }
    case 'status': {
      const win = getMainWindow();
      if (!win) return fail('No main window.');
      const st = await win.webContents.executeJavaScript('window.sero.appControl.recordStatus()') as AppRecordingStatus;
      if (!st.recording) return ok('Not recording.');
      const dur = st.durationMs ? ` (${Math.round(st.durationMs / 1000)}s)` : '';
      return ok(`Recording in progress${dur}`);
    }
    default: return fail('Usage: sero app record <start|stop|status>');
  }
}

// ── Preview (in-app dev server) ──────────────────────────────

async function handlePreview(args: string[]) {
  const { positionals, flags } = parseFlags(args);
  const url = positionals[0] ?? requireFlagString(flags, 'url');
  if (!url) return fail('Usage: sero app preview <url>\n  e.g. sero app preview http://192.168.64.5:3000');
  const win = getMainWindow();
  if (!win) return fail('No main window.');
  const success = await win.webContents.executeJavaScript(
    `window.__appControl?.openDevPreview(${JSON.stringify(url)}) ?? false`,
  ) as boolean;
  return success
    ? ok(`Dev server preview opened in editor: ${url}\nThe preview is now capturable via \`sero app record\` and \`sero app screenshot\`.`)
    : fail('Failed to open dev server preview.');
}

// ── Shared ───────────────────────────────────────────────────

async function interactAndReturn(params: AppInteractionParams) {
  const result = await exec<AppInteractionResult>(`window.sero.appControl.interact(${JSON.stringify(params)})`);
  if (!result.success) return fail(result.message);
  if (result.inspection) {
    return ok(stringifyJson(result.inspection));
  }
  if (result.screenshot) {
    return okWithImage(result.message, result.screenshot);
  }
  return ok(result.message);
}

// ── Registration ─────────────────────────────────────────────

export function registerAppControlCliCommands(registry: CliRegistry): void {
  registry.register({
    name: 'app',
    summary: 'Navigate, screenshot, interact with, and record Sero apps',
    group: 'App Control',
    help:
      'app — Sero app control\n\n' +
      'Navigation:\n' +
      '  sero app list                       List all available apps\n' +
      '  sero app open <appId|name>          Switch to an app by id or visible name\n' +
      '  sero app active                     Show the currently active app\n' +
      '  sero app info <appId|name>          Show app details\n\n' +
      'Screenshots:\n' +
      '  sero app screenshot                 Capture the active app (inline image)\n' +
      '  sero app screenshot --app <id|name> Navigate to app then capture\n' +
      '  sero app screenshot --save <path>   Save screenshot to file\n' +
      '  sero app screenshot --app todo --save ./shot.png\n\n' +
      'Interaction:\n' +
      '  sero app click <selector>           Click by CSS selector\n' +
      '  sero app click --x <n> --y <n>      Click at coordinates relative to the app screenshot\n' +
      '  sero app type "<text>" [--selector <sel>]\n' +
      '  sero app scroll --direction <dir> [--amount <px>]\n' +
      '  sero app select <selector>          Focus an element\n' +
      '  sero app hover <selector>           Hover over an element\n' +
      '  sero app inspect [<selector>] [--x <n> --y <n>]\n' +
      '                                     Inspect elements / point hits\n' +
      '  sero app get-text <selector>        Read text content\n\n' +
      'Recording (MP4 video capture):\n' +
      '  sero app record start               Start recording (2 FPS)\n' +
      '  sero app record stop                 Stop and save as MP4 in <workspace>/sero-recordings/\n' +
      '  sero app record stop --save <path>   Stop and copy MP4 to a custom path\n' +
      '  sero app record status               Check recording status\n\n' +
      'Dev Server Preview (in-app):\n' +
      '  sero app preview <url>               Open URL in editor panel\n' +
      '  Renders the dev server inside Sero so it can be captured by\n' +
      '  sero app record and sero app screenshot.\n\n' +
      'App matching accepts visible names as well as ids (for example, Calculator → calc).\n\n' +
      'Click/type/scroll/select/hover auto-capture a screenshot after the action.\n' +
      'Inspect returns JSON and skips the post-action screenshot.',
    execute: handleApp,
  });
}
