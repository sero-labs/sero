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

  let appLabel = 'active';
  let appId: string | null = null;
  if (targetApp) {
    const opened = await openResolvedAppAndWaitForPanel(targetApp);
    if (!isResolvedAppResult(opened)) return opened;
    appLabel = opened.entry.name;
    appId = opened.entry.id;
  }

  const capture = await appControlHostService.captureVisibleApp();
  if (!capture) return fail('Screenshot failed — app panel not found or not visible.');

  const { base64, rect } = capture;
  const description = buildScreenshotDescription(appLabel, rect);

  if (savePath) {
    const absPath = await saveScreenshot(base64, savePath, ctx);
    return okWithImage(
      `${description}\nSaved: ${absPath} (${Math.round(base64.length * 0.75 / 1024)}KB)`,
      base64,
      'image/png',
      { savedPath: absPath, appId },
    );
  }

  return okWithImage(description, base64, 'image/png', { appId });
}
