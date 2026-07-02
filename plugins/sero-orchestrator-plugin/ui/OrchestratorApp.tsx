import { use, useEffect, useMemo, useState } from 'react';
import { AppContext, useAppTools } from '@sero-ai/app-runtime';
import { Button } from '@sero-ai/ui';
import { Home, Infinity as InfinityIcon, Library, Plus, Sparkles } from 'lucide-react';
import { DEFAULT_INDEX, DEFAULT_LIBRARY_INDEX } from '../shared/defaults';
import type { LibraryIndex, Loop, OrchestratorAction, OrchestratorIndex } from '../shared/types';
import { LoopList } from './components/LoopList';
import { LoopDetail } from './components/LoopDetail';
import { LibraryBrowser } from './components/LibraryBrowser';
import { HomeView } from './components/HomeView';
import { CreateLoopWizard } from './components/CreateLoopWizard';
import type { CreateLoopSubmit } from './components/CreateLoopForm';
import { useWatchedJson } from './lib/use-watched-json';
import './styles.css';

type View = { mode: 'home' } | { mode: 'detail'; loopId: string | null } | { mode: 'create' } | { mode: 'library' };

/** Directory of a file path, tolerant of either separator (renderer has no node:path). */
function dirOf(filePath: string): string {
  const i = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return i >= 0 ? filePath.slice(0, i) : '';
}

/**
 * Orchestrator panel. The home view (default) is a cross-loop "Needs you" inbox +
 * loops overview; selecting a loop opens the list+detail surface. All mutations
 * flow through the `orchestrator` tool → coordinator `requestAction`. The loop
 * list and home follow the watched `index.json` (now carrying an attention
 * payload); the open loop follows its own `loops/<id>/loop.json`.
 */
export function OrchestratorApp() {
  const ctx = use(AppContext);
  const stateDir = useMemo(() => dirOf(ctx?.stateFilePath ?? ''), [ctx?.stateFilePath]);
  const { run } = useAppTools();
  const [view, setView] = useState<View>({ mode: 'home' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reflectSummary, setReflectSummary] = useState<string | null>(null);
  const [libraryDir, setLibraryDir] = useState<string | null>(null);

  const index = useWatchedJson<OrchestratorIndex>(stateDir ? `${stateDir}/index.json` : null, DEFAULT_INDEX);
  const selectedId = view.mode === 'detail' ? view.loopId : null;
  const loopPath = selectedId && stateDir ? `${stateDir}/loops/${selectedId}/loop.json` : null;
  const selected = useWatchedJson<Loop | null>(loopPath, null);
  const libraryIndex = useWatchedJson<LibraryIndex>(libraryDir ? `${libraryDir}/index.json` : null, DEFAULT_LIBRARY_INDEX);

  // Resolve the profile-global library dir once (the renderer can't derive it).
  useEffect(() => {
    let active = true;
    void run('orchestrator', { action: 'library_list' })
      .then((res) => {
        const dir = (res?.details as { libraryDir?: string } | null)?.libraryDir;
        if (active && dir) setLibraryDir(dir);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [run]);

  const dispatch = async (params: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await run('orchestrator', params);
      const details = res.details as { ok?: boolean; error?: string } | null;
      if (details && details.ok === false) setError(details.error ?? 'Action failed.');
      return res;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const onAction = async (action: OrchestratorAction) => {
    if (action.kind === 'create' || action.kind === 'list') return;
    const params: Record<string, unknown> = { action: action.kind };
    if ('loopId' in action) params.loopId = action.loopId;
    if (action.kind === 'choose_suggestion') {
      params.suggestionId = action.suggestionId;
      params.decision = action.decision;
      if (action.rejectionReason !== undefined) params.rejectionReason = action.rejectionReason;
    }
    if (action.kind === 'answer_input') {
      params.requestId = action.requestId;
      params.answersJson = JSON.stringify(action.answers);
    }
    if (action.kind === 'revise' && action.prompt) params.prompt = action.prompt;
    if (action.kind === 'retry_step') params.stepId = action.stepId;
    if (action.kind === 'delete') params.deleteBranch = action.deleteBranch;
    if (action.kind === 'set_step_model') {
      params.stepId = action.stepId;
      if (action.model !== undefined) params.model = action.model;
      if (action.thinking !== undefined) params.thinking = action.thinking;
    }
    if (action.kind === 'set_step_tools') {
      params.stepId = action.stepId;
      params.toolsJson = JSON.stringify(action.tools ?? null);
    }
    if (action.kind === 'set_loop_context') params.contextJson = JSON.stringify(action.overrides);
    if (action.kind === 'library_save') {
      params.mode = action.mode;
      if (action.name !== undefined) params.name = action.name;
      if (action.note !== undefined) params.note = action.note;
    }
    if (action.kind === 'library_set_version') params.version = action.version;
    if (action.kind === 'library_delete') params.entryId = action.entryId;
    const res = await dispatch(params);
    if (action.kind === 'delete') {
      const details = res?.details as { ok?: boolean } | null;
      if (details?.ok !== false) setView({ mode: 'home' });
    }
  };

  const openLibrary = async () => {
    if (libraryDir === null) {
      const res = await dispatch({ action: 'library_list' });
      const details = res?.details as { libraryDir?: string } | null;
      if (details?.libraryDir) setLibraryDir(details.libraryDir);
    }
    setView({ mode: 'library' });
  };

  const onLoadFromLibrary = async (entryId: string, version?: number) => {
    const res = await dispatch({ action: 'library_load', entryId, version });
    const details = res?.details as { ok?: boolean; loop?: { id?: string } } | null;
    if (details && details.ok !== false && details.loop?.id) setView({ mode: 'detail', loopId: details.loop.id });
  };

  const createLoop = async (values: CreateLoopSubmit): Promise<string | null> => {
    const res = await dispatch({
      action: 'create',
      prompt: values.prompt,
      title: values.title,
      useManagedWorktree: values.useManagedWorktree,
      allowDirtyWorkspaceRoot: values.allowDirtyWorkspaceRoot,
      deliveryDestination: values.delivery?.destination,
      deliveryParamsJson: values.delivery?.params ? JSON.stringify(values.delivery.params) : undefined,
      activate: false,
    });
    const details = res?.details as { ok?: boolean; loop?: { id?: string } } | null;
    if (!details || details.ok === false) return null;
    return details.loop?.id ?? null;
  };

  const reflectAll = async () => {
    setReflectSummary(null);
    const res = await dispatch({ action: 'reflect_workspace' });
    const details = res?.details as { workspaceReflection?: { reflected: number; suggestionCount: number } } | null;
    const summary = details?.workspaceReflection;
    if (summary) setReflectSummary(`Reflected ${summary.reflected} loop(s) · ${summary.suggestionCount} suggestion(s) to review.`);
  };

  const openLoop = (loopId: string) => setView({ mode: 'detail', loopId });

  return (
    <div className="flex h-full flex-col bg-background text-foreground">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2">
        <InfinityIcon className="h-5 w-5" />
        <h1 className="text-base font-semibold">Sero Orchestrator</h1>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant={view.mode === 'home' ? 'secondary' : 'ghost'} onClick={() => setView({ mode: 'home' })} title="Home — what needs you">
            <Home className="mr-1 h-3.5 w-3.5" /> Home
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setView({ mode: 'create' })} title="Create a new loop">
            <Plus className="mr-1 h-3.5 w-3.5" /> New
          </Button>
          <Button size="sm" variant="ghost" onClick={openLibrary} title="Browse and load saved loops">
            <Library className="mr-1 h-3.5 w-3.5" /> Library
          </Button>
          <Button size="sm" variant="ghost" disabled={busy || index.loops.length === 0} onClick={reflectAll} title="Learn from every loop's past runs and suggest improvements">
            <Sparkles className="mr-1 h-3.5 w-3.5" /> Reflect all
          </Button>
        </div>
      </header>

      {reflectSummary && (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-accent/40 px-4 py-2 text-xs">
          <span>{reflectSummary}</span>
          <button type="button" className="shrink-0 underline" onClick={() => setReflectSummary(null)}>dismiss</button>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-between gap-2 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive">
          <span>{error}</span>
          <button type="button" className="shrink-0 underline" onClick={() => setError(null)}>dismiss</button>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {view.mode === 'home' && (
          <HomeView loops={index.loops} busy={busy} onAction={onAction} onOpenLoop={openLoop} onNew={() => setView({ mode: 'create' })} />
        )}
        {view.mode === 'create' && (
          <CreateLoopWizard busy={busy} stateDir={stateDir} onCreate={createLoop} onAction={onAction} onOpenLoop={openLoop} onCancel={() => setView({ mode: 'home' })} />
        )}
        {view.mode === 'library' && (
          <LibraryBrowser libraryDir={libraryDir} busy={busy} onLoad={onLoadFromLibrary} onClose={() => setView({ mode: 'home' })} />
        )}
        {view.mode === 'detail' && (
          <>
            <LoopList loops={index.loops} libraryIndex={libraryIndex} selectedId={selectedId} onSelect={openLoop} onNew={() => setView({ mode: 'create' })} />
            {selected ? (
              <LoopDetail loop={selected} busy={busy} onAction={onAction} stateDir={stateDir} libraryDir={libraryDir} libraryIndex={libraryIndex} />
            ) : (
              <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Select a loop from the list.</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default OrchestratorApp;
