import type { CliCommandContext } from '@electron/cli/core/types';
import { fail, parseFlags, requireFlagString } from '@electron/cli/lib/utils';
import {
  buildScreenshotDescription,
  isResolvedAppResult,
  okWithImage,
  openResolvedAppAndWaitForPanel,
  saveScreenshot,
} from './app-control-shared';
import { appControlHostService } from '@electron/features/apps/app-control/host-service';

export async function handleScreenshot(args: string[], ctx: CliCommandContext) {
  const { flags } = parseFlags(args);
  const targetApp = requireFlagString(flags, 'app');
  const savePath = requireFlagString(flags, 'save');
  const selector = requireFlagString(flags, 'selector') ?? undefined;
  const full = flags.has('full');

  let appLabel = 'active';
  let appId: string | null = null;
  if (targetApp) {
    const opened = await openResolvedAppAndWaitForPanel(targetApp);
    if (!isResolvedAppResult(opened)) return opened;
    appLabel = opened.entry.name;
    appId = opened.entry.id;
  }

  const fullCapture = full ? await appControlHostService.fullScreenshot(selector) : null;
  if (full && !fullCapture) return fail('Full screenshot failed — selector not found or app panel not visible.');
  const visibleCapture = fullCapture ? null : await appControlHostService.captureVisibleApp();
  if (!fullCapture && !visibleCapture) return fail('Screenshot failed — app panel not found or not visible.');

  const base64 = fullCapture?.base64 ?? visibleCapture!.base64;
  const description = fullCapture
    ? `Full screenshot of ${fullCapture.target.label} (${fullCapture.target.clientWidth}×${fullCapture.target.scrollHeight} CSS px)`
    : buildScreenshotDescription(appLabel, visibleCapture!.rect);

  if (savePath) {
    const absPath = await saveScreenshot(base64, savePath, ctx);
    return okWithImage(
      `${description}\nSaved PNG: ${absPath} (${Math.round(base64.length * 0.75 / 1024)}KB). Returned image may be optimized for API.`,
      base64,
      'image/png',
      { savedPath: absPath, appId },
    );
  }

  return okWithImage(description, base64, 'image/png', { appId });
}
