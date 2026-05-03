/**
 * IPC handlers for the Environment Doctor.
 *
 * The renderer invokes `run` / `runQuick` and listens for streamed
 * `event` messages. Repair invocations are reserved for v2 — the
 * handler returns a `skipped` response with a coming-soon message.
 */

import { app, BrowserWindow, clipboard, dialog, ipcMain } from 'electron';
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

function broadcast(event: DoctorProgressEvent): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(IpcChannels.doctor.event, event);
    }
  }
}

async function run(args: DoctorRunArgs | undefined, mode: 'quick' | 'full'): Promise<DoctorReport> {
  return runInAppDoctor({
    mode,
    category: args?.category,
    allProfiles: args?.allProfiles,
    seroVersion: app.getVersion(),
    onProgress: (event) => broadcast(event),
  });
}

export function registerDoctorHandlers(): void {
  ipcMain.handle(
    IpcChannels.doctor.run,
    (_event, args?: DoctorRunArgs): Promise<DoctorReport> => run(args, 'full'),
  );

  ipcMain.handle(
    IpcChannels.doctor.runQuick,
    (_event, args?: DoctorRunArgs): Promise<DoctorReport> => run(args, 'quick'),
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
