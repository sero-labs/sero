import { useMemo } from 'react';
import type { DoctorCategory, DoctorResult } from '@/types/ipc';
import { DoctorCategorySection } from './DoctorCategorySection';
import { useDoctor } from './useDoctor';

const ORDERED_CATEGORIES: DoctorCategory[] = [
  'system',
  'runtime',
  'node',
  'profile',
  'workspace',
  'providers',
  'plugins',
  'environment',
];

interface Props {
  /** Render the recovery banner (used when launched in safe mode). */
  safeMode?: boolean;
}

export function DoctorPanel({ safeMode = false }: Props) {
  const { report, error, runState, run, runQuick, exportReport, copyReport } =
    useDoctor();

  const grouped = useMemo(() => {
    const map = new Map<DoctorCategory, DoctorResult[]>();
    if (!report) return map;
    for (const result of report.results) {
      const list = map.get(result.category) ?? [];
      list.push(result);
      map.set(result.category, list);
    }
    return map;
  }, [report]);

  const onCopyFix = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* ignore — clipboard may be unavailable in tests */
    }
  };

  return (
    <div className="p-4 max-w-3xl mx-auto">
      {safeMode && (
        <div className="mb-4 rounded border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <strong className="font-semibold">Recovery mode</strong> — Sero is not
          running normally. Some checks (workspace, providers) are skipped.
        </div>
      )}

      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Environment Doctor</h2>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={runState.running}
            onClick={() => runQuick()}
            className="rounded border border-border px-3 py-1 text-sm hover:bg-accent disabled:opacity-50"
          >
            Quick
          </button>
          <button
            type="button"
            disabled={runState.running}
            onClick={() => run()}
            className="rounded border border-border px-3 py-1 text-sm hover:bg-accent disabled:opacity-50"
          >
            Re-run
          </button>
          <button
            type="button"
            disabled={!report || runState.running}
            onClick={() => exportReport()}
            className="rounded border border-border px-3 py-1 text-sm hover:bg-accent disabled:opacity-50"
          >
            Export
          </button>
          <button
            type="button"
            disabled={!report || runState.running}
            onClick={() => copyReport('json')}
            className="rounded border border-border px-3 py-1 text-sm hover:bg-accent disabled:opacity-50"
          >
            Copy JSON
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-3 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {runState.running && (
        <div className="mb-3 text-sm text-muted-foreground">
          Running diagnostics… ({runState.inFlight} checks complete)
        </div>
      )}

      {!report && !runState.running && (
        <div className="rounded border border-dashed border-border p-4 text-sm text-muted-foreground">
          Press <strong>Re-run</strong> or <strong>Quick</strong> to gather
          diagnostics.
        </div>
      )}

      {report &&
        ORDERED_CATEGORIES.map((category) => (
          <DoctorCategorySection
            key={category}
            category={category}
            results={grouped.get(category) ?? []}
            onCopyFix={onCopyFix}
          />
        ))}

      {report && (
        <footer className="mt-4 text-xs text-muted-foreground">
          Sero {report.seroVersion} · {report.system.os} {report.system.version}{' '}
          ({report.system.arch}) · {report.durationMs}ms · {report.timestamp}
        </footer>
      )}
    </div>
  );
}
