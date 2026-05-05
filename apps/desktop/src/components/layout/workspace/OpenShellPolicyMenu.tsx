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
        className="max-h-[min(34rem,80vh)] w-80 overflow-y-auto p-0"
        onClick={(event) => event.stopPropagation()}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="border-b border-[var(--border-subtle)] p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">OpenShell policy intent</h3>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Profiles are Sero intent only. Current OpenShell Local diagnostics report active policy;
                Sero does not apply generated profile YAML to a running sandbox yet.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadDiagnostics()}
              className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
              title="Refresh policy diagnostics"
            >
              <RefreshCw className={loading ? 'size-3 animate-spin' : 'size-3'} />
            </button>
          </div>
        </div>

        <div className="space-y-3 p-3">
          <section>
            <SectionTitle>Profiles</SectionTitle>
            <div className="mt-1 space-y-1">
              {OPENSHELL_POLICY_PROFILES.map((profile) => (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => void selectProfile(profile.id)}
                  className="flex w-full items-start gap-2 rounded-md border border-[var(--border-subtle)] px-2 py-1.5 text-left hover:bg-[var(--bg-elevated)]"
                >
                  <span className="mt-0.5 flex size-3 shrink-0 items-center justify-center text-[var(--accent-primary)]">
                    {profile.id === selected.id ? <Check className="size-3" /> : null}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-[var(--text-primary)]">{profile.label}</span>
                    <span className="block text-[10px] leading-snug text-[var(--text-muted)]">{profile.summary}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          <ProfileDetails profile={selected} />
          <DiagnosticsDetails diagnostics={diagnostics} loading={loading} error={error} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ProfileDetails({ profile }: { profile: OpenShellPolicyProfile }) {
  return (
    <section className="space-y-2">
      <SectionTitle>Selected: {profile.label}</SectionTitle>
      <DetailList title="Filesystem" items={profile.filesystemAccess} />
      <DetailList title="Network" items={profile.networkAccess} />
      <DetailList title="Process" items={profile.processAccess} />
      <DetailList title="Static boundary" items={profile.staticBoundaries} />
      <DetailList title="Hot-reloadable boundary" items={profile.hotReloadableBoundaries} />
      <DetailList title="Sandbox recreation" items={profile.sandboxRecreationRequiredFor} />
      <DetailList title="Unsupported allow/deny prompts" items={profile.unsupportedInCurrentCli} />
      <p className="rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-faint)] p-2 text-[11px] text-[var(--status-warning-text)]">
        Static filesystem/process changes require sandbox recreation once enforcement exists. Profile
        changes here update persisted Sero intent only; they are not applied to the running sandbox.
      </p>
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
    return <p className="text-xs text-[var(--text-muted)]">Loading OpenShell policy diagnostics…</p>;
  }

  if (error) {
    return <StatusNote>{error}</StatusNote>;
  }

  if (!diagnostics) {
    return <StatusNote>OpenShell policy diagnostics are unavailable for this workspace.</StatusNote>;
  }

  return (
    <section className="space-y-2">
      <SectionTitle>Diagnostics</SectionTitle>
      <StatusNote>{diagnostics.enforcementMessage}</StatusNote>
      <StatusNote>{diagnostics.allowDenyPromptsMessage}</StatusNote>
      <StatusNote>
        Active policy: {diagnostics.activePolicy.available ? diagnostics.activePolicy.summary : diagnostics.activePolicy.summary}
      </StatusNote>
      <StatusNote>
        Recent logs: {diagnostics.logSummary.available ? diagnostics.logSummary.summary : diagnostics.logSummary.summary}
      </StatusNote>
      <div>
        <h4 className="text-[11px] font-medium text-[var(--text-secondary)]">Recent blocked events</h4>
        {diagnostics.blockedEvents.length > 0 ? (
          <ul className="mt-1 space-y-1">
            {diagnostics.blockedEvents.map((event) => (
              <li key={event.line} className="rounded bg-[var(--bg-elevated)] p-1.5 text-[10px] text-[var(--text-muted)]">
                {event.line}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">
            No recent denied/blocked OpenShell log events were found. Log matching is best-effort.
          </p>
        )}
      </div>
    </section>
  );
}

function DetailList({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div>
      <h4 className="text-[11px] font-medium text-[var(--text-secondary)]">{title}</h4>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] leading-snug text-[var(--text-muted)]">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">{children}</h4>;
}

function StatusNote({ children }: { children: ReactNode }) {
  return <p className="rounded-md bg-[var(--bg-elevated)] p-2 text-[11px] text-[var(--text-muted)]">{children}</p>;
}
