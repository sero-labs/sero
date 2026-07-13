import { Badge } from '@sero-ai/ui/components/ui/badge';
import type { WorkspaceRuntimeDiagnosticsIPC } from '../../hooks/host';

interface RuntimeCapabilityListProps {
  row: WorkspaceRuntimeDiagnosticsIPC;
}

type BadgeTone = 'default' | 'secondary' | 'outline';

function stateTone(ready: boolean, state: string): BadgeTone {
  if (ready) return 'default';
  if (state === 'installing') return 'secondary';
  return 'outline';
}

function coreToolsDetail(row: WorkspaceRuntimeDiagnosticsIPC): string {
  const state = row.capabilityState.installState.coreTools;
  if (state === 'ready' && row.capabilityState.available.exec) {
    return 'Host commands, Git, terminals, language servers, and managed previews can use verified system or Sero-managed tools.';
  }
  if (state === 'installing') return 'Sero-managed core tools are installing. Host runtime features become available after verification passes.';
  if (state === 'failed') return 'Managed core tool installation or verification failed. Retry/repair is required before host runtime features are ready.';
  return 'Sero can install missing managed core tools when a host runtime action needs them.';
}

function browserDetail(row: WorkspaceRuntimeDiagnosticsIPC): string {
  const state = row.capabilityState.installState.browserAutomation;
  if (row.capabilityState.available.browserAutomation && state === 'ready') {
    return row.actualRuntime === 'container'
      ? 'Browser automation is available from the active container runtime.'
      : 'Host browser automation pack is installed and Doctor reports it ready.';
  }
  if (state === 'installing') return 'Host browser automation pack is installing. Browser tools are not ready yet.';
  if (state === 'missing') return 'Host browser automation pack artifacts are unavailable for this machine. Use a container runtime for browser tasks.';
  if (state === 'failed') return 'Browser automation is not ready because install or launch verification failed. Retry only if diagnostics mark it installable; containers remain a fallback if available.';
  return row.actualRuntime === 'container'
    ? 'Browser automation will be available after the selected container runtime is healthy.'
    : 'Host browser automation can be installed as a large add-on; containers include it as an optional fallback.';
}

function nativeBuildDetail(row: WorkspaceRuntimeDiagnosticsIPC): string {
  const state = row.capabilityState.installState.nativeBuildTools;
  if (state === 'available') return 'Native compiler/build tools are available according to diagnostics.';
  if (state === 'missing') {
    return 'Native compiler/build tools are not managed by Sero. Install the OS toolchain or use a container runtime for compiler-heavy projects.';
  }
  return 'Native compiler/build tools have not been verified. If native package builds fail, install OS build tools or switch to a container fallback.';
}

function availabilityLabel(available: boolean, support: boolean): string {
  if (available) return 'available';
  if (support) return 'not ready';
  return 'unsupported';
}

function capabilityDetail(entry: WorkspaceRuntimeDiagnosticsIPC['capabilityAudit'][number]): string {
  if (entry.key === 'browserAutomation' && entry.installState === 'missing') {
    return 'Browser automation pack artifacts are unavailable for this machine; use a container runtime for browser tasks.';
  }
  if (entry.key === 'browserAutomation' && entry.installState === 'failed') {
    return 'Browser automation failed verification or install. Retry only when diagnostics mark the failure installable.';
  }
  return entry.detail;
}

export function RuntimeCapabilityList({ row }: RuntimeCapabilityListProps) {
  const coreReady = row.capabilityState.installState.coreTools === 'ready' && row.capabilityState.available.exec;
  const browserReady = row.capabilityState.installState.browserAutomation === 'ready'
    && row.capabilityState.available.browserAutomation;
  const nativeReady = row.capabilityState.installState.nativeBuildTools === 'available';

  return (
    <div className="mt-3 space-y-3">
      <div className="grid gap-2 md:grid-cols-3">
        <div className="rounded-md border border-border/40 bg-background/35 px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground/85">Managed core tools</span>
            <Badge variant={stateTone(coreReady, row.capabilityState.installState.coreTools)}>
              {coreReady ? 'ready' : row.capabilityState.installState.coreTools}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground/75">{coreToolsDetail(row)}</p>
        </div>

        <div className="rounded-md border border-border/40 bg-background/35 px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground/85">Browser automation</span>
            <Badge variant={stateTone(browserReady, row.capabilityState.installState.browserAutomation)}>
              {browserReady ? 'ready' : row.capabilityState.installState.browserAutomation}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground/75">{browserDetail(row)}</p>
        </div>

        <div className="rounded-md border border-border/40 bg-background/35 px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-foreground/85">Native builds</span>
            <Badge variant={nativeReady ? 'secondary' : 'outline'}>
              {row.capabilityState.installState.nativeBuildTools}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground/75">{nativeBuildDetail(row)}</p>
        </div>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground/60">
          Capability availability
        </p>
        <ul className="space-y-1 text-sm text-muted-foreground/75">
          {row.capabilityAudit.map((entry) => (
            <li key={entry.key} className="flex flex-wrap items-start gap-1.5">
              <span className="font-medium text-foreground/80">{entry.label}:</span>
              <Badge variant={entry.available ? 'default' : 'outline'}>
                {availabilityLabel(entry.available, entry.support)}
              </Badge>
              {entry.installState ? <Badge variant="outline">{entry.installState}</Badge> : null}
              <span>{capabilityDetail(entry)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
