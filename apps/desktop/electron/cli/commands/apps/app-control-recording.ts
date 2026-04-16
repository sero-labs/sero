import pathMod from 'path';
import type { CliCommandContext } from '@electron/cli/core/types';
import { fail, ok, parseFlags, requireFlagString } from '@electron/cli/lib/utils';
import { appControlHostService } from '@electron/features/apps/app-control/host-service';
import {
  copyRecordingOutput,
  getFramesDirPath,
} from './app-control-shared';
import { mkdir as mkdirFs } from 'fs/promises';

export async function handleRecord(args: string[], ctx: CliCommandContext) {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'start': {
      const started = await appControlHostService.recordStart();
      return started
        ? ok('Recording started (2 FPS frame capture). Use `sero app record stop` to save as MP4.')
        : fail('Already recording or app panel not found.');
    }

    case 'stop': {
      const result = await appControlHostService.recordStop();
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
      const status = await appControlHostService.recordStatus();
      if (!status.recording) return ok('Not recording.');
      const duration = status.durationMs ? ` (${Math.round(status.durationMs / 1000)}s)` : '';
      return ok(`Recording in progress${duration}`);
    }

    default:
      return fail('Usage: sero app record <start|stop|status>');
  }
}
