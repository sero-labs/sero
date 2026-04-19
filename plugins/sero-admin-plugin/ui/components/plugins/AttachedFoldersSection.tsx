import { memo } from 'react';
import { Link2 } from 'lucide-react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import type { WorkspaceRootIPC } from '../../hooks/host';

interface AttachedFoldersSectionProps {
  workspaceId: string | null;
  folders: WorkspaceRootIPC[];
  loading: boolean;
  busy: boolean;
  error: string | null;
  onAttach: () => Promise<boolean>;
  onDetach: (rootId: string) => Promise<void>;
  onReveal: (path: string) => Promise<void>;
}

export const AttachedFoldersSection = memo(function AttachedFoldersSection({
  workspaceId,
  folders,
  loading,
  busy,
  error,
  onAttach,
  onDetach,
  onReveal,
}: AttachedFoldersSectionProps) {
  const countLabel = folders.length === 1 ? '1 attached folder' : `${folders.length} attached folders`;

  return (
    <section className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-[0_20px_60px_-42px_rgba(0,0,0,0.7)]">
      <div className="border-b border-[var(--border-subtle)] px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-[var(--collab-primary-border)] bg-[var(--collab-primary-muted)] text-[var(--collab-primary)]">
              <Link2 className="size-4" />
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Attached folders</h3>
                <Badge
                  variant="outline"
                  className="border-[var(--collab-primary-border)] bg-[var(--collab-primary-muted)] text-[10px] text-[var(--collab-primary)]"
                >
                  Workspace scoped
                </Badge>
              </div>
              <p className="max-w-3xl text-[11px] leading-5 text-[var(--text-muted)]">
                Attach folders when you want a source tree visible in Explorer and bind-mounted into
                the current workspace container. Attachment is for visibility and editing only—it
                does not activate a plugin.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="border-[var(--collab-primary-border)] bg-[var(--collab-primary-muted)] text-[10px] text-[var(--collab-primary)]"
            >
              {countLabel}
            </Badge>
            <Button
              onClick={() => {
                void onAttach();
              }}
              disabled={busy || !workspaceId}
              variant="outline"
              className="h-9 min-w-32 border-[var(--border-default)] bg-[var(--bg-base)] px-3 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
            >
              {busy ? 'Working…' : 'Attach folder'}
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4 px-4 py-4">
        {error ? (
          <div className="rounded-xl border border-[var(--status-error-border)] bg-[var(--status-error-faint)] px-3 py-2.5 text-[11px] text-[var(--status-error)]">
            {error}
          </div>
        ) : null}

        {!workspaceId ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--bg-base)] px-4 py-6 text-center text-[11px] leading-5 text-[var(--text-muted)]">
            Open a workspace to attach folders for Explorer visibility and agent editing.
          </div>
        ) : loading ? (
          <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-base)] px-4 py-6 text-center text-xs text-[var(--text-muted)]">
            Loading attached folders…
          </div>
        ) : folders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border-default)] bg-[var(--bg-base)] px-4 py-6 text-center text-[11px] leading-5 text-[var(--text-muted)]">
            No attached folders for this workspace.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {folders.map((folder) => (
              <li
                key={folder.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2.5 transition-colors hover:border-[var(--collab-primary-border)]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-medium text-[var(--text-primary)]">{folder.name}</span>
                    <Badge
                      variant="outline"
                      className="h-5 border-[var(--collab-primary-border)] bg-[var(--collab-primary-muted)] px-1.5 text-[9px] text-[var(--collab-primary)]"
                    >
                      attached
                    </Badge>
                  </div>
                  <p className="truncate font-mono text-[10px] text-[var(--text-muted)]">{folder.path}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 border-[var(--border-subtle)] px-2 text-[10px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                    onClick={() => {
                      void onReveal(folder.path);
                    }}
                  >
                    Reveal
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 border-[var(--status-error-border)] bg-[var(--status-error-muted)] px-2 text-[10px] text-[var(--status-error)] hover:bg-[var(--status-error-subtle)]"
                    onClick={() => {
                      void onDetach(folder.id);
                    }}
                    disabled={busy}
                  >
                    Detach
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
});
