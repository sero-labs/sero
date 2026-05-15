import { useEffect, useMemo, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import {
  getSero,
  type OnboardingContainerRuntimeIPC,
  type WorkspaceInfoIPC,
  type WorkspaceRuntimeDiagnosticsIPC,
} from '../hooks/host';

interface RuntimeStateSettingsCardProps {
  disabled?: boolean;
}

function getWorkspaceRuntimeLabel(row: WorkspaceRuntimeDiagnosticsIPC): {
  desired: 'container' | 'host';
  actual: 'container' | 'host';
  tone: 'default' | 'secondary' | 'outline';
  detail: string;
} {
  if (row.desiredRuntime === 'host') {
    return {
      desired: 'host',
      actual: 'host',
      tone: 'secondary',
      detail: 'Container mode disabled in workspace settings.',
    };
  }

  if (row.fallbackCode === 'container_unavailable') {
    return {
      desired: 'container',
      actual: 'container',
      tone: 'outline',
      detail: row.fallbackReason ?? 'Container runtime is selected, but it is unavailable.',
    };
  }

  if (row.fallbackCode === 'backend-unsupported-on-platform') {
    return {
      desired: 'container',
      actual: row.actualRuntime,
      tone: 'outline',
      detail: row.fallbackReason ?? 'Configured runtime is unsupported on this platform; Sero selected a supported runtime.',
    };
  }

  if (row.actualRuntime === 'container') {
    return {
      desired: 'container',
      actual: 'container',
      tone: 'default',
      detail: 'Container runtime is active for this workspace.',
    };
  }

  return {
    desired: 'container',
    actual: 'host',
    tone: 'outline',
    detail: row.fallbackReason ?? 'Container mode is preferred, but no running container is currently available.',
  };
}

export function RuntimeStateSettingsCard({ disabled = false }: RuntimeStateSettingsCardProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<OnboardingContainerRuntimeIPC | null>(null);
  const [rows, setRows] = useState<WorkspaceRuntimeDiagnosticsIPC[]>([]);
  const [workspaceNames, setWorkspaceNames] = useState<Record<string, string>>({});

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
      const [diagnostics, workspaces] = await Promise.all([
        sero.workspace.getRuntimeDiagnostics?.(),
        sero.workspace.list?.(),
      ]);

      setRuntime(onboarding.containerRuntime);
      setRows(diagnostics ?? []);
      setWorkspaceNames(
        Object.fromEntries((workspaces ?? []).map((workspace: WorkspaceInfoIPC) => [workspace.id, workspace.name])),
      );
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
    () => [...rows].sort((left, right) => left.workspaceId.localeCompare(right.workspaceId)),
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
                const unavailable = row.capabilityAudit.filter((entry) => !entry.available);
                return (
                  <div
                    key={row.workspaceId}
                    className="rounded-lg border border-border/40 bg-secondary/20 px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-foreground/85">
                        {workspaceNames[row.workspaceId] ?? row.workspaceId}
                      </span>
                      <Badge variant={state.tone}>{state.desired}</Badge>
                      <span className="text-[11px] text-muted-foreground/60">→</span>
                      <Badge variant={state.actual === 'container' ? 'default' : 'secondary'}>{state.actual}</Badge>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground/75">{state.detail}</p>
                    {unavailable.length > 0 ? (
                      <div className="mt-2 space-y-1">
                        <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                          Container-only features currently unavailable
                        </p>
                        <ul className="space-y-1 text-[11px] text-muted-foreground/75">
                          {unavailable.map((entry) => (
                            <li key={entry.key}>
                              <span className="font-medium text-foreground/80">{entry.label}:</span>{' '}
                              {entry.detail}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
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
