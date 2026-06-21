import { useMemo, useState } from 'react';
import { useAppState, useAppTools } from '@sero-ai/app-runtime';
import { Infinity as InfinityIcon } from 'lucide-react';
import { DEFAULT_STATE } from '../shared/defaults';
import type { OrchestratorAction, OrchestratorState } from '../shared/types';
import { LoopList } from './components/LoopList';
import { LoopDetail } from './components/LoopDetail';
import { CreateLoopForm, type CreateLoopSubmit } from './components/CreateLoopForm';
import './styles.css';

type View = { mode: 'detail'; loopId: string | null } | { mode: 'create' };

/**
 * Orchestrator panel. All mutations flow through the `orchestrator` tool, which
 * routes to the coordinator's `requestAction`. State is read from the watched
 * app-state file via `useAppState`.
 */
export function OrchestratorApp() {
  const [state] = useAppState<OrchestratorState>(DEFAULT_STATE);
  const { run } = useAppTools();
  const [view, setView] = useState<View>({ mode: 'detail', loopId: null });
  const [busy, setBusy] = useState(false);

  const selectedId = view.mode === 'detail' ? view.loopId : null;
  const selected = useMemo(
    () => state.loops.find((l) => l.id === selectedId) ?? null,
    [state.loops, selectedId],
  );

  const dispatch = async (params: Record<string, unknown>) => {
    setBusy(true);
    try {
      return await run('orchestrator', params);
    } finally {
      setBusy(false);
    }
  };

  const onAction = async (action: OrchestratorAction) => {
    if (action.kind === 'create' || action.kind === 'list') return;
    await dispatch({ action: action.kind, loopId: action.loopId });
  };

  const onCreate = async (values: CreateLoopSubmit) => {
    const res = await dispatch({
      action: 'create',
      prompt: values.prompt,
      title: values.title,
      useManagedWorktree: values.useManagedWorktree,
      activate: values.activate,
    });
    const loopId = (res.details as { loop?: { id?: string } } | null)?.loop?.id ?? null;
    setView({ mode: 'detail', loopId });
  };

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2">
        <InfinityIcon className="h-5 w-5" />
        <h1 className="text-base font-semibold">Sero Orchestrator</h1>
        <span className="ml-auto text-xs text-muted-foreground">{state.loops.length} loop(s)</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <LoopList
          loops={state.loops}
          selectedId={selectedId}
          onSelect={(loopId) => setView({ mode: 'detail', loopId })}
          onNew={() => setView({ mode: 'create' })}
        />
        {view.mode === 'create' ? (
          <CreateLoopForm busy={busy} onSubmit={onCreate} onCancel={() => setView({ mode: 'detail', loopId: selectedId })} />
        ) : selected ? (
          <LoopDetail loop={selected} busy={busy} onAction={onAction} />
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a loop or create a new one.
          </div>
        )}
      </div>
    </div>
  );
}

export default OrchestratorApp;
