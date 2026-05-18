import { useState } from 'react';
import { FolderOpen, Info, Link, Plus, X } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace';
import { useWorkspaceContainer } from '@/stores/container';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero-ai/ui/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sero-ai/ui/components/ui/tooltip';
import type { WorkspaceInfo } from '@/types/ipc';
import { IconAction } from '@/components/ui/IconAction';

/** Extract the last segment of a path (no dependency needed in renderer). */
function basename(p: string): string {
  return p.split('/').filter(Boolean).pop() ?? p;
}

/**
 * Popover menu to manage runtime mounts — workspace references
 * and arbitrary host folders mounted into this workspace's runtime.
 */
export function WorkspaceReferencesMenu({ workspace }: { workspace: WorkspaceInfo }) {
  const [open, setOpen] = useState(false);
  const allWorkspaces = useWorkspaceStore((s) => s.workspaces);
  const container = useWorkspaceContainer(workspace.id);
  const addReference = useWorkspaceStore((s) => s.addReference);
  const removeReference = useWorkspaceStore((s) => s.removeReference);
  const addMount = useWorkspaceStore((s) => s.addMount);
  const removeMount = useWorkspaceStore((s) => s.removeMount);

  // Workspaces available to add as references (not self, not already referenced)
  const available = allWorkspaces.filter(
    (w) => w.id !== workspace.id && !workspace.references.includes(w.id),
  );

  const referenced = allWorkspaces.filter((w) =>
    workspace.references.includes(w.id),
  );

  const handleBrowseMount = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const folderPath = await window.sero.workspace.pickFolder();
    if (folderPath) {
      await addMount(workspace.id, folderPath);
    }
  };

  const mountNotice = workspace.runtime.backend === 'host'
    ? 'References and folder mounts take effect after switching this workspace to Docker or Apple Container.'
    : container.status !== 'running'
      ? 'Sero restarts the container to apply changes. If work is running, changes apply next time it restarts.'
      : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <IconAction
          as="span"
          role="button"
          tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setOpen(true); } }}
          title="Manage runtime mounts"
        >
          <Link className="size-3" />
        </IconAction>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-64 p-0"
        onClick={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* ── Workspace references ──────────────────────────── */}
        <div className="flex items-center justify-between gap-2 p-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Workspace references
          </span>
          {mountNotice ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  aria-label="Runtime mounts notice"
                  tabIndex={0}
                  className="rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                >
                  <Info className="size-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" className="max-w-64 text-xs">
                {mountNotice}
              </TooltipContent>
            </Tooltip>
          ) : null}
        </div>

        {referenced.length > 0 && (
          <MountList
            items={referenced.map((ref) => ({ key: ref.id, label: ref.name }))}
            onRemove={(key) => removeReference(workspace.id, key)}
          />
        )}

        {available.length > 0 && (
          <div className="border-t border-[var(--border-subtle)] px-1 py-1">
            <span className="px-2 py-1 text-xs text-[var(--text-muted)]">
              Add workspace
            </span>
            {available.map((ws) => (
              <button
                key={ws.id}
                onClick={() => addReference(workspace.id, ws.id)}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
              >
                <Plus className="size-3 shrink-0 text-[var(--text-muted)]" />
                <span className="truncate">{ws.name}</span>
              </button>
            ))}
          </div>
        )}

        {referenced.length === 0 && available.length === 0 && (
          <div className="px-2 pb-2 text-xs text-[var(--text-muted)]">
            No other workspaces available
          </div>
        )}

        {/* ── Arbitrary folder mounts ──────────────────────── */}
        <div className="border-t border-[var(--border-subtle)] p-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Folder mounts
          </span>
        </div>

        {workspace.mounts.length > 0 && (
          <MountList
            items={workspace.mounts.map((m) => ({ key: m, label: basename(m), sublabel: m }))}
            onRemove={(key) => removeMount(workspace.id, key)}
          />
        )}

        <div className="border-t border-[var(--border-subtle)] px-1 py-1">
          <button
            onClick={handleBrowseMount}
            className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
          >
            <FolderOpen className="size-3 shrink-0 text-[var(--text-muted)]" />
            <span>Browse…</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Reusable list of mounted items with remove buttons. */
function MountList({
  items,
  onRemove,
}: {
  items: { key: string; label: string; sublabel?: string }[];
  onRemove: (key: string) => void;
}) {
  return (
    <div className="border-t border-[var(--border-subtle)] px-1 py-1">
      {items.map((item) => (
        <div
          key={item.key}
          className="group flex items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-[var(--bg-elevated)]"
        >
          <div className="min-w-0 flex-1">
            <span className="block truncate text-[var(--text-secondary)]">{item.label}</span>
            {item.sublabel && (
              <span className="block truncate text-[10px] text-[var(--text-muted)]">{item.sublabel}</span>
            )}
          </div>
          <IconAction
            onClick={() => onRemove(item.key)}
            className="ml-1 shrink-0"
            title={`Remove ${item.label}`}
          >
            <X className="size-3" />
          </IconAction>
        </div>
      ))}
    </div>
  );
}
