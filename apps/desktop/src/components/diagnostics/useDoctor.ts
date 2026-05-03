/**
 * useDoctor — renderer hook driving the DoctorPanel.
 *
 * Each `run`/`runQuick` call mints a fresh `runId`, passes it to main,
 * and ignores any progress events that don't echo it back. This keeps
 * stale events (from a previous run that was superseded, or from a
 * different window in dev) from corrupting UI state.
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

function newRunId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `doctor-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useDoctor(): UseDoctorResult {
  const [report, setReport] = useState<DoctorReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runState, setRunState] = useState<DoctorRunState>({
    running: false,
    inFlight: 0,
  });
  const inFlightRef = useRef(0);
  const activeRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = window.sero.doctor.onEvent((event: DoctorProgressEvent) => {
      // Ignore events that don't belong to the run this hook initiated.
      if (event.runId !== activeRunIdRef.current) return;

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
      const runId = args?.runId ?? newRunId();
      activeRunIdRef.current = runId;
      setError(null);
      inFlightRef.current = 0;
      setRunState({ running: true, inFlight: 0 });
      try {
        const next =
          mode === 'quick'
            ? await window.sero.doctor.runQuick({ ...args, runId })
            : await window.sero.doctor.run({ ...args, runId });
        // Only commit the report if this run is still the latest one.
        if (activeRunIdRef.current === runId) {
          setReport(next);
        }
      } catch (err) {
        if (activeRunIdRef.current === runId) {
          setError(err instanceof Error ? err.message : String(err));
        }
      } finally {
        if (activeRunIdRef.current === runId) {
          setRunState({ running: false, inFlight: 0 });
        }
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
