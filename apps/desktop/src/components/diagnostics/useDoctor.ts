/**
 * useDoctor — renderer hook driving the DoctorPanel.
 *
 * Subscribes to `window.sero.doctor.onEvent` for streamed progress and
 * exposes `run`/`runQuick` actions plus the latest report.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DoctorProgressEvent,
  DoctorReport,
  DoctorRunArgs,
} from '@/types/ipc';

export interface DoctorRunState {
  running: boolean;
  /** When running, the most recent in-flight result count. */
  inFlight: number;
}

export interface UseDoctorResult {
  report: DoctorReport | null;
  runState: DoctorRunState;
  error: string | null;
  run: (args?: DoctorRunArgs) => Promise<void>;
  runQuick: (args?: DoctorRunArgs) => Promise<void>;
  exportReport: () => Promise<void>;
  copyReport: (format?: 'json' | 'plaintext') => Promise<void>;
}

export function useDoctor(): UseDoctorResult {
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runState, setRunState] = useState<DoctorRunState>({
    running: false,
    inFlight: 0,
  });
  const inFlightRef = useRef(0);

  useEffect(() => {
    const unsubscribe = window.sero.doctor.onEvent((event: DoctorProgressEvent) => {
      if (event.kind === 'check-done') {
        inFlightRef.current += 1;
        setRunState((prev) => ({ ...prev, inFlight: inFlightRef.current }));
      } else if (event.kind === 'all-done') {
        inFlightRef.current = 0;
        setReport(event.report);
        setRunState({ running: false, inFlight: 0 });
      }
    });
    return unsubscribe;
  }, []);

  const launch = useCallback(
    async (mode: 'full' | 'quick', args?: DoctorRunArgs): Promise<void> => {
      setError(null);
      inFlightRef.current = 0;
      setRunState({ running: true, inFlight: 0 });
      try {
        const next =
          mode === 'quick'
            ? await window.sero.doctor.runQuick(args)
            : await window.sero.doctor.run(args);
        setReport(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setRunState({ running: false, inFlight: 0 });
      }
    },
    [],
  );

  const exportReport = useCallback(async () => {
    if (!report) return;
    await window.sero.doctor.exportReport(report);
  }, [report]);

  const copyReport = useCallback(
    async (format: 'json' | 'plaintext' = 'json') => {
      if (!report) return;
      await window.sero.doctor.copyReport(report, format);
    },
    [report],
  );

  return {
    report,
    runState,
    error,
    run: (args) => launch('full', args),
    runQuick: (args) => launch('quick', args),
    exportReport,
    copyReport,
  };
}
