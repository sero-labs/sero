/**
 * ResourceSection, shared list + editor layout for CRUD resource sections.
 * Used by Agents, Skills, and Prompts sections.
 */

import { Plus, RefreshCw } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';

interface ResourceSectionProps {
  label: string;
  count: number;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onNew: () => void;
  list: React.ReactNode;
  editor: React.ReactNode | null;
}

export function ResourceSection({
  label,
  count,
  loading,
  error,
  onRefresh,
  onNew,
  list,
  editor,
}: ResourceSectionProps) {
  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex w-[260px] shrink-0 flex-col border-r border-border/30">
        <div className="flex items-center gap-2 border-b border-border/30 px-3 py-1.5">
          <span className="flex-1 text-xs text-muted-foreground">
            {count} {label.toLowerCase()}{count !== 1 ? 's' : ''}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={onRefresh} title="Refresh">
            <RefreshCw className="size-3" />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onNew} title={`New ${label}`}>
            <Plus className="size-3" />
          </Button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <span className="admin-loading text- text-muted-foreground">Loading…</span>
          </div>
        ) : (
          list
        )}
      </div>

      <div className="flex flex-1 flex-col min-w-0">
        {error && (
          <div className="border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        {editor ?? <EmptyState label={label} onNew={onNew} />}
      </div>
    </div>
  );
}

function EmptyState({ label, onNew }: { label: string; onNew: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10">
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          className="text-primary/60"
        >
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M14 2v4a2 2 0 0 0 2 2h4" />
        </svg>
      </div>
      <p className="text-base text-muted-foreground">
        Select a {label.toLowerCase()} to edit, or create a new one
      </p>
      <Button variant="secondary" size="sm" onClick={onNew}>
        <Plus className="size-3.5" />
        New {label}
      </Button>
    </div>
  );
}
