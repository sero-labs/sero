import { useState, type ReactNode } from 'react';
import { Check, RefreshCw, Shield } from 'lucide-react';
import {
  OPENSHELL_POLICY_PROFILES,
  getOpenShellPolicyProfile,
  type OpenShellPolicyProfile,
  type OpenShellPolicyProfileId,
} from '@sero-ai/common';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero-ai/ui/components/ui/popover';
import { IconAction } from '@/components/ui/IconAction';
import { useWorkspaceStore } from '@/stores/workspace';
import type { WorkspaceInfo } from '@/types/ipc';
import type { OpenShellPolicyDiagnosticsIPC } from '@sero-ai/common';

interface OpenShellPolicyMenuProps {
  workspace: WorkspaceInfo;
}

export function OpenShellPolicyMenu({ workspace }: OpenShellPolicyMenuProps) {
  const [open, setOpen] = useState(false);
  const [diagnostics, setDiagnostics] = useState<OpenShellPolicyDiagnosticsIPC | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentWorkspace = useWorkspaceStore(
    (state) => state.workspaces.find((item) => item.id === workspace.id) ?? workspace,
  );
  const setOpenShellPolicyProfile = useWorkspaceStore((state) => state.setOpenShellPolicyProfile);
  const selected = getOpenShellPolicyProfile(currentWorkspace.runtime?.policyProfileId);

  const loadDiagnostics = async () => {
    setLoading(true);
    setError(null);
    try {
      const results = await window.sero.workspace.getRuntimeDiagnostics(currentWorkspace.id);
      setDiagnostics(results.find((item) => item.workspaceId === currentWorkspace.id)?.openShellPolicy ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OpenShell policy diagnostics are unavailable.');
      setDiagnostics(null);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      void loadDiagnostics();
    }
  };

  const selectProfile = async (profileId: OpenShellPolicyProfileId) => {
    await setOpenShellPolicyProfile(currentWorkspace.id, profileId);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <IconAction
          as="span"
          role="button"
          tabIndex={-1}
          onClick={(event) => {
            event.stopPropagation();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.stopPropagation();
            }
          }}
          title={`OpenShell policy: ${selected.label}`}
        >
          <Shield className="size-3" />
        </IconAction>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="max-h-[min(38rem,82vh)] w-[28rem] max-w-[calc(100vw-2rem)] overflow-y-auto overflow-x-hidden p-0"
        onClick={(event) => event.stopPropagation()}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="border-b border-[var(--border-subtle)] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">OpenShell policy intent</h3>
              <p className="mt-1 max-w-[34rem] text-[11px] leading-snug text-[var(--text-muted)]">
                Profiles are Sero intent only. Active OpenShell policy is shown as diagnostics;
                Sero does not apply generated profile YAML yet.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadDiagnostics()}
              className="shrink-0 rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
              title="Refresh policy diagnostics"
            >
              <RefreshCw className={loading ? 'size-3 animate-spin' : 'size-3'} />
            </button>
          </div>
        </div>

        <div className="space-y-3 p-3">
          <ProfilePicker selected={selected} onSelect={(profileId) => void selectProfile(profileId)} />
          <ProfileSummary profile={selected} />
          <DiagnosticsDetails diagnostics={diagnostics} loading={loading} error={error} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ProfilePicker({
  selected,
  onSelect,
}: {
  selected: OpenShellPolicyProfile;
  onSelect: (profileId: OpenShellPolicyProfileId) => void;
}) {
  return (
    <section>
      <SectionTitle>Profiles</SectionTitle>
      <div className="mt-1 grid grid-cols-2 gap-1">
        {OPENSHELL_POLICY_PROFILES.map((profile) => {
          const isSelected = profile.id === selected.id;
          return (
            <button
              key={profile.id}
              type="button"
              onClick={() => onSelect(profile.id)}
              className={isSelected
                ? 'flex min-w-0 items-center gap-1.5 rounded-md border border-[var(--accent-primary)] bg-[var(--bg-elevated)] px-2 py-1.5 text-left text-[11px] font-medium text-[var(--text-primary)] ring-1 ring-[var(--accent-primary)]/30'
                : 'flex min-w-0 items-center gap-1.5 rounded-md border border-[var(--border-subtle)] px-2 py-1.5 text-left text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'}
            >
              <span className="flex size-3 shrink-0 items-center justify-center text-[var(--accent-primary)]">
                {isSelected ? <Check className="size-3" /> : null}
              </span>
              <span className="truncate">{profile.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function ProfileSummary({ profile }: { profile: OpenShellPolicyProfile }) {
  return (
    <section className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-base)] p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <SectionTitle>Selected: {profile.label}</SectionTitle>
          <p className="mt-1 text-[11px] leading-snug text-[var(--text-muted)]">{profile.summary}</p>
        </div>
        <Badge>Intent only</Badge>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        <CompactList title="Filesystem" items={profile.filesystemAccess} />
        <CompactList title="Network" items={profile.networkAccess} />
        <CompactList title="Process" items={profile.processAccess} />
      </div>

      <Collapsible title="Boundaries, sandbox recreation, and unsupported flows">
        <div className="grid gap-2 sm:grid-cols-2">
          <DetailList title="Static boundary" items={profile.staticBoundaries} />
          <DetailList title="Hot-reloadable boundary" items={profile.hotReloadableBoundaries} />
          <DetailList title="Sandbox recreation" items={profile.sandboxRecreationRequiredFor} />
          <DetailList title="Unsupported allow/deny prompts" items={profile.unsupportedInCurrentCli} />
        </div>
        <p className="mt-2 rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-faint)] p-2 text-[11px] leading-snug text-[var(--status-warning-text)]">
          Static filesystem/process changes require sandbox recreation once enforcement exists. Profile
          changes here update persisted Sero intent only; they are not applied to the running sandbox.
        </p>
      </Collapsible>
    </section>
  );
}

function DiagnosticsDetails({
  diagnostics,
  loading,
  error,
}: {
  diagnostics: OpenShellPolicyDiagnosticsIPC | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading && !diagnostics) {
    return <StatusNote>Loading OpenShell policy diagnostics…</StatusNote>;
  }

  if (error) {
    return <StatusNote>{error}</StatusNote>;
  }

  if (!diagnostics) {
    return <StatusNote>OpenShell policy diagnostics are unavailable for this workspace.</StatusNote>;
  }

  const activePolicyLabel = diagnostics.activePolicy.available ? 'Active policy available' : 'Active policy unavailable';
  const logsLabel = diagnostics.logSummary.available ? 'Recent logs scanned' : 'Recent logs unavailable';

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle>Diagnostics</SectionTitle>
        {loading ? <span className="text-[10px] text-[var(--text-muted)]">Refreshing…</span> : null}
      </div>

      <div className="grid gap-1.5 sm:grid-cols-2">
        <StatusCard title="Enforcement" value="Preview only" />
        <StatusCard title="Allow/deny prompts" value="Unsupported" />
        <StatusCard title="OpenShell policy" value={activePolicyLabel} />
        <StatusCard title="Logs" value={logsLabel} />
      </div>

      <Collapsible title="Diagnostic messages">
        <StatusNote>{diagnostics.enforcementMessage}</StatusNote>
        <StatusNote>{diagnostics.allowDenyPromptsMessage}</StatusNote>
      </Collapsible>

      <Collapsible title={activePolicyLabel}>
        <CodeBlock>{diagnostics.activePolicy.summary}</CodeBlock>
      </Collapsible>

      <Collapsible title={logsLabel}>
        <CodeBlock>{diagnostics.logSummary.summary}</CodeBlock>
      </Collapsible>

      <div className="rounded-md border border-[var(--border-subtle)] p-2">
        <h4 className="text-[11px] font-medium text-[var(--text-secondary)]">Recent blocked events</h4>
        {diagnostics.blockedEvents.length > 0 ? (
          <ul className="mt-1 max-h-28 space-y-1 overflow-y-auto">
            {diagnostics.blockedEvents.map((event) => (
              <li key={event.line} className="break-words rounded bg-[var(--bg-elevated)] p-1.5 text-[10px] text-[var(--text-muted)]">
                {event.line}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[11px] leading-snug text-[var(--text-muted)]">
            No recent denied/blocked OpenShell log events were found. Log matching is best-effort.
          </p>
        )}
      </div>
    </section>
  );
}

function CompactList({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div className="min-w-0 rounded-md bg-[var(--bg-elevated)] p-2">
      <h4 className="text-[11px] font-medium text-[var(--text-secondary)]">{title}</h4>
      <p className="mt-1 line-clamp-3 text-[10px] leading-snug text-[var(--text-muted)]">
        {items.join(' ')}
      </p>
    </div>
  );
}

function DetailList({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div className="min-w-0">
      <h4 className="text-[11px] font-medium text-[var(--text-secondary)]">{title}</h4>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] leading-snug text-[var(--text-muted)]">
        {items.map((item) => <li key={item} className="break-words">{item}</li>)}
      </ul>
    </div>
  );
}

function StatusCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--border-subtle)] px-2 py-1.5">
      <div className="text-[10px] text-[var(--text-muted)]">{title}</div>
      <div className="truncate text-[11px] font-medium text-[var(--text-secondary)]">{value}</div>
    </div>
  );
}

function Collapsible({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group mt-2 rounded-md border border-[var(--border-subtle)]">
      <summary className="cursor-pointer list-none px-2 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]">
        <span className="inline-block transition-transform group-open:rotate-90">›</span> {title}
      </summary>
      <div className="space-y-2 border-t border-[var(--border-subtle)] p-2">{children}</div>
    </details>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-[var(--bg-elevated)] p-2 text-[10px] leading-snug text-[var(--text-muted)]">
      {children}
    </pre>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">{children}</h4>;
}

function StatusNote({ children }: { children: ReactNode }) {
  return <p className="break-words rounded-md bg-[var(--bg-elevated)] p-2 text-[11px] leading-snug text-[var(--text-muted)]">{children}</p>;
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full border border-[var(--border-subtle)] px-2 py-0.5 text-[10px] text-[var(--text-muted)]">
      {children}
    </span>
  );
}
