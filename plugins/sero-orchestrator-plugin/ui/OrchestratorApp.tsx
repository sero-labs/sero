import { useMemo, useState } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import { Button } from '@sero-ai/ui';

import {
  DEFAULT_STATE,
  normalizeOrchestratorState,
  type OrchestratorState,
} from '../shared/types';
import { GoalDetail } from './components/GoalDetail';
import { GoalList } from './components/GoalList';
import { NewGoalForm } from './components/NewGoalForm';
import { useOrchestratorActions } from './lib/actions';
import './styles.css';

export function OrchestratorApp() {
  const [rawState] = useAppState<OrchestratorState>(DEFAULT_STATE);
  const state = useMemo(() => normalizeOrchestratorState(rawState), [rawState]);
  const actions = useOrchestratorActions();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = state.loops.find((l) => l.id === selectedId) ?? null;

  const banner = actions.error
    ? { text: actions.error, tone: 'error' as const }
    : actions.notice
      ? { text: actions.notice, tone: 'info' as const }
      : null;

  return (
    <div className="flex size-full flex-col overflow-hidden bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <h1 className="text-sm font-semibold tracking-tight">Orchestrator</h1>
        <div className="flex items-center gap-3">
          {state.loops.length > 0 && (
            <Button size="sm" variant="outline" disabled={actions.busy} onClick={() => actions.health()}>
              Health check
            </Button>
          )}
          <span className="text-xs text-muted-foreground tabular-nums">
            {state.loops.length} goal{state.loops.length === 1 ? '' : 's'}
          </span>
        </div>
      </header>

      {banner && (
        <button
          type="button"
          onClick={actions.dismiss}
          className={`flex items-center justify-between gap-3 px-4 py-2 text-left text-xs ${
            banner.tone === 'error'
              ? 'bg-destructive/10 text-destructive'
              : 'bg-secondary/50 text-muted-foreground'
          }`}
        >
          <span className="min-w-0 flex-1 truncate">{banner.text}</span>
          <span className="shrink-0 opacity-60">Dismiss</span>
        </button>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="flex w-72 shrink-0 flex-col border-r border-border">
          <NewGoalForm busy={actions.busy} onCreate={actions.create} />
          <GoalList loops={state.loops} selectedId={selectedId} onSelect={setSelectedId} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {selected ? (
            <GoalDetail loop={selected} actions={actions} />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-1 p-8 text-center">
              <p className="text-sm font-medium">Select a goal</p>
              <p className="max-w-xs text-xs text-muted-foreground">
                Pick a goal on the left, or add one to get started.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Both named and default exports are required for Module Federation lazy loading.
export default OrchestratorApp;
