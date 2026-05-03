/**
 * IPC handlers for the Environment Doctor.
 *
 * Each `run` / `runQuick` invocation streams progress events back to
 * the originating webContents only. The renderer also passes a `runId`
 * so it can ignore stale or concurrent runs from other renderers.
 *
 * Repair invocations are reserved for v2 — the handler returns a
 * `skipped` response with a coming-soon message.
 */

import { app, clipboard, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { writeFile } from 'fs/promises';
import { IpcChannels } from '@/types/ipc-channels';
import type {
  DoctorProgressEvent,
  DoctorReport,
  DoctorRepairResponse,
  DoctorRunArgs,
} from '@/types/ipc';
import { renderPlaintext } from '@electron/features/doctor/engine/report';
import { runInAppDoctor } from '@electron/features/doctor/modes/in-app';

function sendTo(event: IpcMainInvokeEvent, payload: DoctorProgressEvent): void {
  const sender = event.sender;
  if (sender.isDestroyed()) return;
  sender.send(IpcChannels.doctor.event, payload);
}

async function run(
  event: IpcMainInvokeEvent,
  args: DoctorRunArgs | undefined,
  mode: 'quick' | 'full',
): Promise<DoctorReport> {
  return runInAppDoctor({
    mode,
    category: args?.category,
    allProfiles: args?.allProfiles,
    runId: args?.runId,
    seroVersion: app.getVersion(),
    onProgress: (progress) => sendTo(event, progress),
  });
}

export function registerDoctorHandlers(): void {
  ipcMain.handle(
    IpcChannels.doctor.run,
    (event, args?: DoctorRunArgs): Promise<DoctorReport> => run(event, args, 'full'),
  );

  ipcMain.handle(
    IpcChannels.doctor.runQuick,
    (event, args?: DoctorRunArgs): Promise<DoctorReport> => run(event, args, 'quick'),
  );

  ipcMain.handle(
    IpcChannels.doctor.exportReport,
    async (_event, report: DoctorReport): Promise<{ saved: boolean; path?: string }> => {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const result = await dialog.showSaveDialog({
        defaultPath: `sero-doctor-report-${stamp}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) return { saved: false };
      await writeFile(result.filePath, JSON.stringify(report, null, 2));
      return { saved: true, path: result.filePath };
    },
  );

  ipcMain.handle(
    IpcChannels.doctor.copyReport,
    (_event, report: DoctorReport, format: 'json' | 'plaintext' = 'json'): void => {
      const text = format === 'plaintext'
        ? renderPlaintext(report)
        : JSON.stringify(report, null, 2);
      clipboard.writeText(text);
    },
  );

  ipcMain.handle(
    IpcChannels.doctor.repair,
    async (): Promise<DoctorRepairResponse> => ({
      status: 'skipped',
      message: 'Auto-repair not yet enabled.',
    }),
  );
}
