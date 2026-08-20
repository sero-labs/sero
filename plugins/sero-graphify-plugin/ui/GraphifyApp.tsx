import { useCallback, useEffect } from 'react';
import { useAppState, useAppTools } from '@sero-ai/app-runtime';
import { Badge, Button, Card, Switch } from '@sero-ai/ui';
import { Waypoints } from 'lucide-react';
import { DEFAULT_STATE, withStateDefaults, type GraphifyState } from '../shared/types';
import { GraphSearch } from './GraphSearch';
import { ModelPicker, SpendSettings } from './GraphifySettings';
import { WorkspaceCard } from './WorkspaceCard';
import './styles.css';

export function GraphifyApp() {
  const [stored, setState] = useAppState<GraphifyState>(DEFAULT_STATE);
  // A state file written by an older build has no caps and no ledger to render.
  const state = withStateDefaults(stored);
  const { run } = useAppTools();

  const workspaces = Object.values(state.workspaces);
  const index = useCallback((action: string, workspaceId?: string) => {
    void run('graphify_index', { action, workspace: workspaceId });
  }, [run]);

  const updateSettings = useCallback((update: (settings: GraphifyState['settings']) => GraphifyState['settings']) => {
    setState((current) => ({ ...current, settings: update(current.settings) }));
  }, [setState]);

  // Push-based discovery: opening the panel asks the runtime to re-read the
  // profile workspace list, so newly created workspaces appear immediately.
  useEffect(() => {
    void run('graphify_index', { action: 'sync' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chosen = state.settings.model;
  // Every paid action stays unavailable until a model is chosen. Graphify does
  // not fall back to the library's default: that is how a build could run with
  // nobody able to say what it cost.
  const blocked = !chosen || state.settings.paused;

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto bg-background p-4 text-foreground">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Waypoints className="h-5 w-5" />
          <h1 className="text-lg font-semibold">Graphify</h1>
          <Badge variant="outline">{state.provisioning.status}</Badge>
          {state.provisioning.version && <Badge variant="secondary">v{state.provisioning.version}</Badge>}
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            Pause
            <Switch
              checked={state.settings.paused}
              onCheckedChange={(paused) => updateSettings((settings) => ({ ...settings, paused }))}
            />
          </label>
          <Button size="sm" variant="outline" disabled={blocked} onClick={() => index('enable-all')}>Index all</Button>
        </div>
      </header>

      {state.notice && (
        <Card className="flex items-center justify-between border-destructive/50 p-3 text-base">
          <span>{state.notice.message}</span>
          <Button size="sm" variant="ghost" onClick={() => setState((current) => ({ ...current, notice: null }))}>Dismiss</Button>
        </Card>
      )}

      {state.provisioning.status === 'failed' && (
        <Card className="border-destructive p-3 text-base">{state.provisioning.error}</Card>
      )}

      {state.provisioning.availableVersion && (
        <Card className="flex items-center justify-between p-3 text-base">
          <span>
            graphify {state.provisioning.availableVersion} is available. Updating makes the next build of each
            workspace pay full price again, so nothing is re-indexed until you ask.
          </span>
          <Button size="sm" variant="outline" onClick={() => index('upgrade')}>Update</Button>
        </Card>
      )}

      {!chosen && (
        <p className="text-base text-muted-foreground">
          Choose a backend and model. Graphify will not index anything until you do.
        </p>
      )}
      <ModelPicker state={state} onChange={updateSettings} />
      {chosen && <SpendSettings state={state} onChange={updateSettings} />}

      <GraphSearch run={run} profileGraph={state.profileGraph} />

      <div className="flex flex-col gap-2">
        {workspaces.length === 0 && (
          <p className="text-base text-muted-foreground">No workspaces discovered yet — the background runtime populates this list on startup.</p>
        )}
        {workspaces.map((entry) => (
          <WorkspaceCard
            key={entry.workspaceId}
            entry={entry}
            blocked={blocked}
            onIndex={(action) => index(action, entry.workspaceId)}
          />
        ))}
      </div>

      {state.removedWorkspaces.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Removed since indexing: {state.removedWorkspaces.map((removed) => removed.name).join(', ')}.
          Their graphs are gone; re-indexing would cost again.
        </p>
      )}
    </div>
  );
}

export default GraphifyApp;
