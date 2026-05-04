/**
 * Preload bridge for the Environment Doctor.
 *
 * Exposed on `window.sero.doctor`.
 */

import { ipcRenderer, type IpcRendererEvent } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type {
  DoctorProgressEvent,
  DoctorReport,
  DoctorRepairResponse,
  DoctorRunArgs,
} from '@/types/ipc';

export const doctorBridge = {
  run: (args?: DoctorRunArgs): Promise<DoctorReport> =>
    ipcRenderer.invoke(IpcChannels.doctor.run, args),
  runQuick: (args?: DoctorRunArgs): Promise<DoctorReport> =>
    ipcRenderer.invoke(IpcChannels.doctor.runQuick, args),
  exportReport: (report: DoctorReport): Promise<{ saved: boolean; path?: string }> =>
    ipcRenderer.invoke(IpcChannels.doctor.exportReport, report),
  copyReport: (report: DoctorReport, format?: 'json' | 'plaintext'): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.doctor.copyReport, report, format ?? 'json'),
  invokeRepair: (repairId: string): Promise<DoctorRepairResponse> =>
    ipcRenderer.invoke(IpcChannels.doctor.repair, repairId),
  onEvent: (handler: (event: DoctorProgressEvent) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, payload: DoctorProgressEvent): void => {
      handler(payload);
    };
    ipcRenderer.on(IpcChannels.doctor.event, listener);
    return () => ipcRenderer.removeListener(IpcChannels.doctor.event, listener);
  },
};
