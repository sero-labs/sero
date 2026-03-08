import { useState } from 'react';
import { Link, Plus, X } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero/ui/components/ui/popover';
import type { WorkspaceInfo } from '@/types/ipc';

/**
 * Popover menu to manage workspace references — which other workspaces
 * are mounted into this workspace's container.
 */
export function WorkspaceReferencesMenu({ workspace }: { workspace: WorkspaceInfo }) {
  const [open, setOpen] = useState(false);
  const allWorkspaces = useWorkspaceStore((s) => s.workspaces);
  const addReference = useWorkspaceStore((s) => s.addReference);
  const removeReference = useWorkspaceStore((s) => s.removeReference);

  // Workspaces available to add as references (not self, not already referenced)
  const available = allWorkspaces.filter(
    (w) => w.id !== workspace.id && !workspace.references.includes(w.id),
  );

  const referenced = allWorkspaces.filter((w) =>
    workspace.references.includes(w.id),
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={-1}
          onClick={(e) => { e.stopPropagation(); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setOpen(true); } }}
          className="rounded p-0.5 hover:bg-[var(--bg-base)]"
          title="Manage workspace references"
        >
          <Link className="size-3 text-[var(--text-muted)]" />
        </span>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-56 p-0"
        onClick={(e) => e.stopPropagation()}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="p-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            References
          </span>
        </div>

        {/* Current references */}
        {referenced.length > 0 && (
          <div className="border-t border-[var(--border-subtle)] px-1 py-1">
            {referenced.map((ref) => (
              <div
                key={ref.id}
                className="flex items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-[var(--bg-elevated)]"
              >
                <span className="truncate text-[var(--text-secondary)]">
                  {ref.name}
                </span>
                <button
                  onClick={() => removeReference(workspace.id, ref.id)}
                  className="ml-1 shrink-0 rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-base)] hover:text-[var(--text-primary)]"
                  title={`Remove reference to ${ref.name}`}
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Available workspaces to add */}
        {available.length > 0 && (
          <div className="border-t border-[var(--border-subtle)] px-1 py-1">
            <span className="px-2 py-1 text-xs text-[var(--text-muted)]">
              Add reference
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
      </PopoverContent>
    </Popover>
  );
}
