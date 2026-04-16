import { copyFile, cp as copyTree, lstat, mkdir as mkdirFs, writeFile } from 'fs/promises';
import pathMod from 'path';
import { prepareToolImage } from '@electron/shared/media/image-resize';
import { appControlHostService } from '@electron/features/apps/app-control/host-service';
import { fail, parseFlags, requireFlagString } from '@electron/cli/lib/utils';
import type { CliCommandContext, CliResult } from '@electron/cli/core/types';
import type { AppControlEntry, AppPanelRect } from '@/types/ipc';
import { resolveAppTarget } from './app-control-target';

export type ParsedFlags = ReturnType<typeof parseFlags>['flags'];

export async function listApps(): Promise<AppControlEntry[]> {
  return appControlHostService.list();
}

export async function resolveApp(query: string): Promise<AppControlEntry | null> {
  const apps = await listApps();
  return resolveAppTarget(apps, query);
}

export interface ResolvedAppResult {
  entry: AppControlEntry;
}

export function isResolvedAppResult(value: CliResult | ResolvedAppResult): value is ResolvedAppResult {
  return 'entry' in value;
}

export async function openResolvedApp(query: string): Promise<ResolvedAppResult | CliResult> {
  const entry = await resolveApp(query);
  if (!entry) {
    const apps = await listApps();
    return fail(`App "${query}" not found. Use an app id or visible name. Available: ${apps.map((app) => app.id).join(', ')}`);
  }

  const success = await appControlHostService.open(entry.id);
  if (!success) {
    return fail(`Failed to open app "${entry.name}" (${entry.id}).`);
  }

  return { entry };
}

export async function openResolvedAppAndWaitForPanel(query: string): Promise<ResolvedAppResult | CliResult> {
  const entry = await resolveApp(query);
  if (!entry) {
    return fail(`App "${query}" not found. Use an app id or visible name.`);
  }

  const success = await appControlHostService.openAndWait(entry.id, { requireVisiblePanel: true });
  if (!success) {
    return fail(`Failed to open app "${entry.name}" (${entry.id}).`);
  }

  return { entry };
}

export function okWithImage(
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

export function getFramesDirPath(targetPath: string): string {
  const parsed = pathMod.parse(targetPath);
  return pathMod.extname(targetPath)
    ? pathMod.join(parsed.dir, `${parsed.name}-frames`)
    : targetPath;
}

export async function copyRecordingOutput(srcPath: string, destPath: string): Promise<void> {
  const srcStat = await lstat(srcPath);
  if (srcStat.isDirectory()) {
    await copyTree(srcPath, destPath, { force: true, recursive: true });
    return;
  }
  await copyFile(srcPath, destPath);
}

export function parseFiniteFlagValue(value: string | null): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseCoordinateFlags(
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

export function parseAmountFlag(flags: ParsedFlags): number | CliResult {
  const amountStr = requireFlagString(flags, 'amount');
  if (!amountStr) return 300;
  const amount = parseFiniteFlagValue(amountStr);
  return amount == null ? fail('--amount must be a finite number.') : amount;
}

export function isCliResult(value: CliResult | { x: number; y: number }): value is CliResult {
  return 'exitCode' in value;
}

export async function saveScreenshot(
  base64: string,
  savePath: string,
  ctx: CliCommandContext,
): Promise<string> {
  const absPath = pathMod.isAbsolute(savePath) ? savePath : pathMod.join(ctx.cwd, savePath);
  await mkdirFs(pathMod.dirname(absPath), { recursive: true });
  await writeFile(absPath, Buffer.from(base64, 'base64'));
  return absPath;
}

export function buildScreenshotDescription(
  appLabel: string,
  rect: AppPanelRect,
): string {
  return `Screenshot of ${appLabel} app (${Math.round(rect.width)}×${Math.round(rect.height)} CSS px). For app click --x/--y, use coordinates relative to this image from the top-left corner.`;
}
