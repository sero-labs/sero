import { useState } from 'react';
import type { ProjectRecord } from '../../shared/record';
import type { ArchitectActions } from '../lib/actions';
import { inspectorPhase, NOTHING_RECORDED } from '../lib/run-state';
import { LIFETIME, useInspectorTrace, useLifetime } from '../lib/use-inspector-trace';
import { InspectorHeader } from './InspectorHeader';
import { InspectorLifetime } from './InspectorLifetime';
import { InspectorRun } from './InspectorRun';

function Status({ children }: { children: string }) {
  return <p className="ar-insp-empty" role="status">{children}</p>;
}

/**
 * The run inspector. Opening it reads the newest run's totals, activity tree
 * and first page of charges, so the first screen answers where the run's time
 * and money went without pressing anything.
 */
export function Inspector({ record, actions, onBack }: {
  record: ProjectRecord; actions: ArchitectActions; onBack(): void;
}) {
  const runs = record.runs ?? [];
  const [scope, setScope] = useState(() => runs.at(-1)?.id ?? LIFETIME);
  // Paused holds the spend it paused at, so a pushed record does not re-read.
  const [pausedAt, setPausedAt] = useState<number | null>(null);
  const knownSpendUsd = pausedAt ?? record.budget.spentUsd;
  const { pageState, loading, notice, load, clear } = useInspectorTrace(record, actions, scope, knownSpendUsd);
  const lifetime = useLifetime(record, actions, scope, knownSpendUsd);
  // A page still held from the previous scope is never shown under the new one.
  const page = pageState?.journalId === scope ? pageState.page : null;
  const phase = inspectorPhase({ loading, page });
  const open = runs.find((run) => run.id === scope)?.endedAt === null;

  const changeScope = (next: string) => {
    setScope(next);
    setPausedAt(null);
    clear();
  };
  const body = () => {
    if (scope === LIFETIME) return lifetime ? <InspectorLifetime lifetime={lifetime} onOpen={changeScope} /> : <Status>Loading</Status>;
    if (phase === 'loading') return <Status>Loading</Status>;
    if (phase === 'empty' || !page) return <Status>{NOTHING_RECORDED}</Status>;
    // A new key per scope resets the zoom, selection and highlight with it.
    return <InspectorRun key={scope} record={record} page={page} loading={loading}
      onLoadMore={(after) => void load(scope, true, after)} onBack={onBack} />;
  };

  return (
    <div className="ar-body ar-insp">
      <InspectorHeader
        name={record.name}
        runs={runs}
        scope={scope}
        onScope={changeScope}
        live={open ? pausedAt === null : null}
        onLive={() => setPausedAt(pausedAt === null ? record.budget.spentUsd : null)}
        onBack={onBack}
      />
      {notice && <p className="ar-error" role="alert">{notice}</p>}
      {body()}
    </div>
  );
}
