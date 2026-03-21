/**
 * CLI commands for agent app control.
 *
 * All commands are under the `sero app` namespace and go through the
 * sero-cli bridge (AD-020) — zero additional tool schema tokens.
 */

import { BrowserWindow } from 'electron';
import { copyFile, mkdir as mkdirFs, writeFile } from 'fs/promises';
import pathMod from 'path';
import type { CliRegistry } from '../registry';
import type { CliCommandContext } from '../types';
import { fail, ok, parseFlags, requireFlagString, stringifyJson } from './utils';
import type {
  AppControlEntry,
  AppInteractionParams,
  AppInteractionResult,
  AppPanelRect,
  AppRecordingStatus,
  AppRecordingResult,
} from '../../../src/types/ipc';
import { captureRegion } from '../../utils/capture';

// ── Helpers ──────────────────────────────────────────────────

function getMainWindow(): BrowserWindow | null {
  return BrowserWindow.getAllWindows()[0] ?? null;
}

async function exec<T>(code: string): Promise<T> {
  const win = getMainWindow();
  if (!win) throw new Error('No main window available');
  return win.webContents.executeJavaScript(code) as Promise<T>;
}

async function captureAppScreenshot(): Promise<string | null> {
  const win = getMainWindow();
  if (!win) return null;
  const rect = await exec<AppPanelRect | null>('window.__appControl?.getAppRect() ?? null');
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return captureRegion(win, rect);
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
    case 'get-text': return handleGetText(rest);
    case 'record': return handleRecord(rest, ctx);
    case 'preview': return handlePreview(rest);
    default:
      return fail('Usage: sero app <list|open|active|info|screenshot|click|type|scroll|select|hover|get-text|record|preview>');
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
  const appId = args[0];
  if (!appId) return fail('Usage: sero app open <appId>');
  const success = await exec<boolean>(`window.__appControl?.openApp(${JSON.stringify(appId)}) ?? false`);
  if (!success) {
    const apps = await exec<AppControlEntry[]>('window.__appControl?.getList() ?? []');
    return fail(`App "${appId}" not found. Available: ${apps.map((a) => a.id).join(', ')}`);
  }
  return ok(`Switched to app: ${appId}`);
}

async function handleActive() {
  const active = await exec<string>('window.__appControl?.getActive() ?? "unknown"');
  return ok(`Active app: ${active}`);
}

async function handleInfo(args: string[]) {
  const appId = args[0];
  if (!appId) return fail('Usage: sero app info <appId>');
  const info = await exec<AppControlEntry | null>(`window.__appControl?.getInfo(${JSON.stringify(appId)}) ?? null`);
  if (!info) return fail(`App "${appId}" not found.`);
  return ok(stringifyJson(info));
}

// ── Screenshots ──────────────────────────────────────────────

async function handleScreenshot(args: string[], ctx: CliCommandContext) {
  const { flags } = parseFlags(args);
  const targetApp = requireFlagString(flags, 'app');
  const savePath = requireFlagString(flags, 'save');

  if (targetApp) {
    const success = await exec<boolean>(`window.__appControl?.openApp(${JSON.stringify(targetApp)}) ?? false`);
    if (!success) return fail(`App "${targetApp}" not found.`);
    await new Promise((r) => setTimeout(r, 500));
  }
  const base64 = await captureAppScreenshot();
  if (!base64) return fail('Screenshot failed — app panel not found or not visible.');

  const description = `Screenshot of ${targetApp ?? 'active'} app`;

  // If --save specified, also write to disk
  if (savePath) {
    const absPath = pathMod.isAbsolute(savePath) ? savePath : pathMod.join(ctx.cwd, savePath);
    await mkdirFs(pathMod.dirname(absPath), { recursive: true });
    await writeFile(absPath, Buffer.from(base64, 'base64'));
    // Still return the image inline so it displays in the chat
    return {
      output: JSON.stringify({
        type: 'image', format: 'png', base64,
        description: `${description}\nSaved: ${absPath} (${Math.round(base64.length * 0.75 / 1024)}KB)`,
      }),
      exitCode: 0,
    };
  }

  // Return inline image for the agent to see
  return {
    output: JSON.stringify({ type: 'image', format: 'png', base64, description }),
    exitCode: 0,
  };
}

// ── Interaction ──────────────────────────────────────────────

async function handleClick(args: string[]) {
  const { positionals, flags } = parseFlags(args);
  const selector = positionals[0] ?? null;
  const xStr = requireFlagString(flags, 'x');
  const yStr = requireFlagString(flags, 'y');
  const params: AppInteractionParams = { action: 'click' };
  if (selector) params.selector = selector;
  else if (xStr && yStr) { params.x = Number(xStr); params.y = Number(yStr); }
  else return fail('Usage: sero app click <selector> OR sero app click --x <n> --y <n>');
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
  const amountStr = requireFlagString(flags, 'amount');
  return interactAndReturn({
    action: 'scroll', direction,
    amount: amountStr ? Number(amountStr) : 300,
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
      if (!result) return fail('No active recording.');

      const { flags } = parseFlags(rest);
      const savePath = requireFlagString(flags, 'save');

      // If --save specified, copy to the requested location
      if (savePath) {
        const absPath = pathMod.isAbsolute(savePath) ? savePath : pathMod.join(ctx.cwd, savePath);
        await mkdirFs(pathMod.dirname(absPath), { recursive: true });
        await copyFile(result.path, absPath);
        const format = result.isVideo ? 'MP4' : 'frames';
        const dur = Math.round(result.durationMs / 1000);
        return ok(`Recording saved: ${absPath} (${format}, ${result.frameCount} frames, ${dur}s)`);
      }

      const format = result.isVideo ? 'MP4 video' : 'frames directory (ffmpeg not available)';
      const dur = Math.round(result.durationMs / 1000);
      return ok(`Recording saved: ${result.path}\nFormat: ${format}\nFrames: ${result.frameCount}, Duration: ${dur}s`);
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
  const result = await exec<AppInteractionResult>(`window.__appControl?.interact(${JSON.stringify(params)})`);
  if (!result.success) return fail(result.message);
  if (result.screenshot) {
    return {
      output: JSON.stringify({ message: result.message, type: 'image', format: 'png', base64: result.screenshot }),
      exitCode: 0,
    };
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
      '  sero app open <appId>               Switch to an app\n' +
      '  sero app active                     Show the currently active app\n' +
      '  sero app info <appId>               Show app details\n\n' +
      'Screenshots:\n' +
      '  sero app screenshot                 Capture the active app (inline image)\n' +
      '  sero app screenshot --app <id>      Navigate to app then capture\n' +
      '  sero app screenshot --save <path>   Save screenshot to file\n' +
      '  sero app screenshot --app todo --save ./shot.png\n\n' +
      'Interaction:\n' +
      '  sero app click <selector>           Click by CSS selector\n' +
      '  sero app click --x <n> --y <n>      Click at coordinates\n' +
      '  sero app type "<text>" [--selector <sel>]\n' +
      '  sero app scroll --direction <dir> [--amount <px>]\n' +
      '  sero app select <selector>          Focus an element\n' +
      '  sero app hover <selector>           Hover over an element\n' +
      '  sero app get-text <selector>        Read text content\n\n' +
      'Recording (MP4 video capture):\n' +
      '  sero app record start               Start recording (2 FPS)\n' +
      '  sero app record stop                 Stop and save as MP4\n' +
      '  sero app record stop --save <path>   Stop and copy MP4 to path\n' +
      '  sero app record status               Check recording status\n\n' +
      'Dev Server Preview (in-app):\n' +
      '  sero app preview <url>               Open URL in editor panel\n' +
      '  Renders the dev server inside Sero so it can be captured by\n' +
      '  sero app record and sero app screenshot.\n\n' +
      'Click/type/scroll/select/hover auto-capture a screenshot after the action.',
    execute: handleApp,
  });
}
