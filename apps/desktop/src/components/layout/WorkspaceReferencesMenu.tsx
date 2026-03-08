import { useState } from 'react';
import { FolderOpen, Link, Plus, X } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero/ui/components/ui/popover';
import type { WorkspaceInfo } from '@/types/ipc';

/** Extract the last segment of a path (no dependency needed in renderer). */
function basename(p: string): string {
  return p.split('/').filter(Boolean).pop() ?? p;
}

/**
 * Popover menu to manage container mounts — workspace references
 * and arbitrary host folders mounted into this workspace's container.
 */
export function WorkspaceReferencesMenu({ workspace }: { workspace: WorkspaceInfo }) {
  const [open, setOpen] = useState(false);
  const allWorkspaces = useWorkspaceStore((s) => s.workspaces);
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

  const totalMounts = workspace.references.length + workspace.mounts.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setOpen(true); } }}
          className="rounded p-0.5 hover:bg-[var(--bg-base)]"
          title="Manage container mounts"
        >
          <Link className="size-3 text-[var(--text-muted)]" />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-64 p-0"
        onClick={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* ── Workspace references ──────────────────────────── */}
        <div className="p-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Workspace references
          </span>
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
          <button
            onClick={() => onRemove(item.key)}
            className="ml-1 shrink-0 rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)]"
            title={`Remove ${item.label}`}
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
