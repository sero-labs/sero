import { memo } from 'react';
import { Link2 } from 'lucide-react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import type { WorkspaceRootIPC } from '../../hooks/host';
import { CountPill, PluginSection, SectionHeader } from './section-ui';

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
  return (
    <PluginSection>
      <SectionHeader
        icon={Link2}
        title="Attached folders"
        description="Attach a source tree to make it visible in Explorer and bind-mounted into the current workspace. Attachment is for visibility and editing only — it does not activate a plugin or start local development."
        meta={
          <>
            <Badge variant="secondary" className="px-1.5 py-0 text-xs">
              Workspace scoped
            </Badge>
            <CountPill>{folders.length}</CountPill>
          </>
        }
        action={
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-sm"
            onClick={() => {
              void onAttach();
            }}
            disabled={busy || !workspaceId}
          >
            {busy ? 'Working…' : 'Attach folder'}
          </Button>
        }
      />

      <div className="space-y-3 p-4">
        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        {!workspaceId ? (
          <EmptyRow>Open a workspace to attach folders for Explorer visibility and agent editing.</EmptyRow>
        ) : loading ? (
          <div className="admin-loading rounded-lg border border-border/40 bg-background/40 px-4 py-6 text-center text-xs text-muted-foreground">
            Loading attached folders…
          </div>
        ) : folders.length === 0 ? (
          <EmptyRow>No attached folders for this workspace.</EmptyRow>
        ) : (
          <ul className="flex flex-col gap-2">
            {folders.map((folder) => (
              <li
                key={folder.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/40 bg-background/40 px-3 py-2.5 transition-colors hover:border-border/70"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-medium text-foreground">{folder.name}</span>
                    <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-xs">
                      attached
                    </Badge>
                  </div>
                  <p className="truncate font-mono text-xs text-muted-foreground/70">{folder.path}</p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-sm"
                    onClick={() => {
                      void onReveal(folder.path);
                    }}
                  >
                    Reveal
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-sm border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
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
    </PluginSection>
  );
});

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border/50 bg-background/30 px-4 py-6 text-center text-xs leading-relaxed text-muted-foreground">
      {children}
    </div>
  );
}
