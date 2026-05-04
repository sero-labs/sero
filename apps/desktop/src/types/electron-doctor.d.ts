import type {
  DoctorProgressEvent,
  DoctorRepairResponse,
  DoctorReport,
  DoctorRunArgs,
} from './doctor';

export interface SeroDoctorAPI {
  /** Run a full doctor pass. */
  run(args?: DoctorRunArgs): Promise<DoctorReport>;
  /** Run a quick (≤ 2s) doctor pass. */
  runQuick(args?: DoctorRunArgs): Promise<DoctorReport>;
  /** Open a save dialog and persist the report as JSON. */
  exportReport(report: DoctorReport): Promise<{ saved: boolean; path?: string }>;
  /** Copy the report to the clipboard. */
  copyReport(report: DoctorReport, format?: 'json' | 'plaintext'): Promise<void>;
  /** Reserved for v2: invoke a registered repair. Returns a coming-soon stub in v1. */
  invokeRepair(repairId: string): Promise<DoctorRepairResponse>;
  /** Subscribe to streamed progress events for an in-flight run. */
  onEvent(handler: (event: DoctorProgressEvent) => void): () => void;
}
