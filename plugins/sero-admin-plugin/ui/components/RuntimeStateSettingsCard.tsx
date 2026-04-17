import { useEffect, useMemo, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import {
  getSero,
  type ContainerInfoIPC,
  type OnboardingContainerRuntimeIPC,
  type WorkspaceInfoIPC,
} from '../hooks/host';

interface RuntimeStateSettingsCardProps {
  disabled?: boolean;
}

interface WorkspaceRuntimeRow {
  workspace: WorkspaceInfoIPC;
  container: ContainerInfoIPC | null;
}

function getWorkspaceRuntimeLabel(row: WorkspaceRuntimeRow): {
  desired: 'container' | 'host';
  actual: 'container' | 'host';
  tone: 'default' | 'secondary' | 'outline';
  detail: string;
} {
  if (!row.workspace.container) {
    return {
      desired: 'host',
      actual: 'host',
      tone: 'secondary',
      detail: 'Container mode disabled in workspace settings.',
    };
  }

  if (row.container?.state === 'running') {
    return {
      desired: 'container',
      actual: 'container',
      tone: 'default',
      detail: row.container.ipAddress
        ? `Container running at ${row.container.ipAddress}.`
        : 'Container runtime is active for this workspace.',
    };
  }

  if (row.container?.state === 'stopped') {
    return {
      desired: 'container',
      actual: 'host',
      tone: 'outline',
      detail: 'Container exists but is stopped, so commands currently fall back to host mode.',
    };
  }

  return {
    desired: 'container',
    actual: 'host',
    tone: 'outline',
    detail: 'Container mode is preferred, but no running container is currently available.',
  };
}

export function RuntimeStateSettingsCard({ disabled = false }: RuntimeStateSettingsCardProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<OnboardingContainerRuntimeIPC | null>(null);
  const [rows, setRows] = useState<WorkspaceRuntimeRow[]>([]);

  const load = async (background = false) => {
    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const sero = getSero();
      const onboarding = await sero.onboarding.getState();
      const workspaces = await sero.workspace.list?.();
      const workspaceList = workspaces ?? [];
      const containerApi = sero.container;
      const statuses = containerApi
        ? await Promise.all(workspaceList.map(async (workspace) => ({
          workspace,
          container: await containerApi.status(workspace.id),
        })))
        : workspaceList.map((workspace) => ({ workspace, container: null }));

      setRuntime(onboarding.containerRuntime);
      setRows(statuses);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load runtime diagnostics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const sortedRows = useMemo(
    () => [...rows].sort((left, right) => left.workspace.name.localeCompare(right.workspace.name)),
    [rows],
  );

  return (
    <Card className="mx-4 mt-4 border-border/40 bg-background/70">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Runtime diagnostics</CardTitle>
            <CardDescription className="mt-1 text-xs">
              Shows whether Sero is currently using host or container runtime paths.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[11px]"
            disabled={disabled || loading || refreshing}
            onClick={() => void load(true)}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {loading ? (
          <div className="rounded-lg border border-border/40 bg-secondary/20 px-3 py-2 text-[11px] text-muted-foreground/75">
            Loading runtime diagnostics…
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
            {error}
          </div>
        ) : null}

        {runtime ? (
          <div className="rounded-lg border border-border/40 bg-secondary/20 px-3 py-2 text-[11px] text-muted-foreground/80">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground/85">Machine runtime</span>
              <Badge variant={runtime.status === 'available' ? 'default' : 'outline'}>
                {runtime.status === 'available' ? 'containers available' : 'host fallback ready'}
              </Badge>
            </div>
            <p className="mt-2">{runtime.message}</p>
            {runtime.docsUrl ? (
              <Button
                variant="link"
                size="sm"
                className="mt-1 h-auto px-0 text-[11px]"
                onClick={() => void getSero().shell.openExternal?.(runtime.docsUrl!)}
              >
                Open container setup guide
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/60">
              Workspace runtime state
            </p>
            <p className="text-[11px] text-muted-foreground/60">Desired → actual</p>
          </div>

          {sortedRows.length === 0 ? (
            <div className="rounded-lg border border-border/40 bg-secondary/20 px-3 py-2 text-[11px] text-muted-foreground/75">
              No workspaces registered.
            </div>
          ) : (
            <div className="space-y-2">
              {sortedRows.map((row) => {
                const state = getWorkspaceRuntimeLabel(row);
                return (
                  <div
                    key={row.workspace.id}
                    className="rounded-lg border border-border/40 bg-secondary/20 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-foreground/85">{row.workspace.name}</span>
                      <Badge variant={state.tone}>{state.desired}</Badge>
                      <span className="text-[11px] text-muted-foreground/60">→</span>
                      <Badge variant={state.actual === 'container' ? 'default' : 'secondary'}>{state.actual}</Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground/75">{state.detail}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
