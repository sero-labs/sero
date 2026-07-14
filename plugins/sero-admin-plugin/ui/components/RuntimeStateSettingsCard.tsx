import { useEffect, useMemo, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@sero-ai/ui/components/ui/card';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@sero-ai/ui/components/ui/table';
import {
  getSero,
  type OnboardingContainerRuntimeIPC,
  type WorkspaceInfoIPC,
  type WorkspaceRuntimeDiagnosticsIPC,
} from '../hooks/host';
import { RuntimeInstallControls } from './runtime/RuntimeInstallControls';

interface RuntimeStateSettingsCardProps {
  disabled?: boolean;
}

interface CapabilityStatus {
  label: string;
  ready: boolean;
}

function getWorkspaceRuntimeState(row: WorkspaceRuntimeDiagnosticsIPC): {
  label: string;
  tone: 'default' | 'secondary' | 'outline';
  detail?: string;
  configured?: string;
} {
  if (row.desiredRuntime === 'host') {
    return {
      label: 'Host',
      tone: 'secondary',
    };
  }

  if (row.fallbackCode === 'container_unavailable') {
    return {
      label: 'Container unavailable',
      tone: 'outline',
      detail: row.fallbackReason ?? 'Container runtime is selected, but it is unavailable.',
      configured: 'Container',
    };
  }

  if (row.fallbackCode === 'backend-unsupported-on-platform') {
    return {
      label: row.actualRuntime === 'host' ? 'Host fallback' : 'Container',
      tone: 'outline',
      detail: row.fallbackReason ?? 'Configured runtime is unsupported on this platform; Sero selected a supported runtime.',
      configured: 'Container',
    };
  }

  if (row.actualRuntime === 'container') {
    return {
      label: 'Container',
      tone: 'default',
    };
  }

  return {
    label: 'Host fallback',
    tone: 'outline',
    detail: row.fallbackReason ?? 'Container runtime is selected, but this workspace is currently running on the host.',
    configured: 'Container',
  };
}

function getCapabilityStatuses(row: WorkspaceRuntimeDiagnosticsIPC): {
  coreTools: CapabilityStatus;
  browserAutomation: CapabilityStatus;
  nativeBuildTools: CapabilityStatus;
} {
  const { installState } = row.capabilityState;
  const coreReady = installState.coreTools === 'ready' && row.capabilityState.available.exec;
  const browserReady = installState.browserAutomation === 'ready'
    && row.capabilityState.available.browserAutomation;

  return {
    coreTools: {
      label: coreReady
        ? 'Ready'
        : {
            installing: 'Installing',
            missing: 'On demand',
            failed: 'Needs repair',
            ready: 'Not ready',
          }[installState.coreTools],
      ready: coreReady,
    },
    browserAutomation: {
      label: browserReady
        ? 'Ready'
        : {
            installable: 'Not installed',
            installing: 'Installing',
            missing: 'Unavailable',
            failed: 'Needs repair',
            ready: 'Not ready',
          }[installState.browserAutomation],
      ready: browserReady,
    },
    nativeBuildTools: {
      label: {
        available: 'Available',
        missing: 'Not installed',
        unknown: 'Not verified',
      }[installState.nativeBuildTools],
      ready: installState.nativeBuildTools === 'available',
    },
  };
}

function CapabilityStatusCell({ status }: { status: CapabilityStatus }) {
  return (
    <span className={status.ready ? 'text-foreground/80' : 'font-medium text-muted-foreground'}>
      {status.label}
    </span>
  );
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
    () => rows.toSorted((left, right) => left.workspaceId.localeCompare(right.workspaceId)),
    [rows],
  );

  return (
    <Card className="mx-4 mt-4 border-border/40 bg-background/70">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Runtime diagnostics</CardTitle>
            <CardDescription className="mt-1 text-xs">
              Host is the recommended default. Containers are optional upgrades for isolation, Linux parity, browser automation, and native build fallback.
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-sm"
            disabled={disabled || loading || refreshing}
            onClick={() => void load(true)}
          >
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        {loading ? (
          <div className="rounded-lg border border-border/40 bg-secondary/20 px-3 py-2 text-sm text-muted-foreground/75">
            Loading runtime diagnostics…
          </div>
        ) : null}

        {error ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {!loading ? (
          <div className="overflow-hidden rounded-lg border border-border/40">
            {runtime ? (
              <div className="grid divide-y divide-border/40 sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                  <span className="text-sm font-medium text-foreground/85">Host runtime</span>
                  <Badge variant="secondary">Recommended</Badge>
                </div>
                <div className="px-3 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-medium text-foreground/85">Containers</span>
                    <div className="flex items-center gap-2">
                      <Badge variant={runtime.status === 'available' ? 'secondary' : 'outline'}>
                        {runtime.status === 'available' ? 'Available' : 'Not configured'}
                      </Badge>
                      {runtime.docsUrl ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-1.5 text-sm"
                          onClick={() => void getSero().shell.openExternal?.(runtime.docsUrl!)}
                        >
                          Setup guide
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {runtime.status !== 'available' ? (
                    <p className="mt-1 text-sm text-muted-foreground/70">{runtime.message}</p>
                  ) : null}
                </div>
              </div>
            ) : null}
            <RuntimeInstallControls disabled={disabled} onChanged={() => void load(true)} />
          </div>
        ) : null}

        {!loading && !error && sortedRows.length === 0 ? (
          <div className="rounded-lg border border-border/40 px-3 py-2.5 text-sm text-muted-foreground/70">
            No workspaces registered.
          </div>
        ) : null}

        {!loading && sortedRows.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-border/40">
            <Table aria-label="Workspace runtime diagnostics" className="min-w-[760px] text-sm">
              <TableHeader className="bg-secondary/15">
                <TableRow className="hover:bg-transparent">
                  <TableHead scope="col" className="h-9 w-[34%] px-3 text-xs text-muted-foreground">Workspace</TableHead>
                  <TableHead scope="col" className="h-9 px-3 text-xs text-muted-foreground">Runtime</TableHead>
                  <TableHead scope="col" className="h-9 px-3 text-xs text-muted-foreground">Core tools</TableHead>
                  <TableHead scope="col" className="h-9 px-3 text-xs text-muted-foreground">Browser automation</TableHead>
                  <TableHead scope="col" className="h-9 px-3 text-xs text-muted-foreground">Native builds</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedRows.map((row) => {
                  const runtimeState = getWorkspaceRuntimeState(row);
                  const capabilities = getCapabilityStatuses(row);
                  return (
                    <TableRow key={row.workspaceId}>
                      <TableCell className="px-3 py-2.5 whitespace-normal">
                        <p className="font-medium text-foreground/90">
                          {workspaceNames[row.workspaceId] ?? row.workspaceId}
                        </p>
                        {runtimeState.detail ? (
                          <p className="mt-0.5 max-w-xl text-xs text-muted-foreground/70">
                            {runtimeState.detail}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 align-top">
                        <Badge variant={runtimeState.tone}>{runtimeState.label}</Badge>
                        {runtimeState.configured ? (
                          <span className="mt-1 block text-xs text-muted-foreground/60">
                            {runtimeState.configured} selected
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="px-3 py-2.5 align-top">
                        <CapabilityStatusCell status={capabilities.coreTools} />
                      </TableCell>
                      <TableCell className="px-3 py-2.5 align-top">
                        <CapabilityStatusCell status={capabilities.browserAutomation} />
                      </TableCell>
                      <TableCell className="px-3 py-2.5 align-top">
                        <CapabilityStatusCell status={capabilities.nativeBuildTools} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
