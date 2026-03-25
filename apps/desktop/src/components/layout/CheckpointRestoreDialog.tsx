import { Loader2 } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@sero-ai/ui/components/ui/dialog';
import { Checkbox } from '@sero-ai/ui/components/ui/checkbox';
import { Button } from '@sero-ai/ui/components/ui/button';

export interface RestorePreviewFileChange {
  path: string;
  additions: number;
  deletions: number;
}

export function summarizeDiffFiles(diff: string): RestorePreviewFileChange[] {
  const files: RestorePreviewFileChange[] = [];
  const lines = diff.split(/\r?\n/);
  let current: RestorePreviewFileChange | null = null;

  for (const line of lines) {
    const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (match) {
      const path = match[2] === '/dev/null' ? match[1] : match[2];
      current = { path, additions: 0, deletions: 0 };
      files.push(current);
      continue;
    }

    if (!current) continue;
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) current.additions += 1;
    if (line.startsWith('-')) current.deletions += 1;
  }

  return files;
}

interface CheckpointRestoreDialogProps {
  open: boolean;
  checkpointId: string;
  files: RestorePreviewFileChange[];
  isLoading: boolean;
  error: string | null;
  isRestoring: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function CheckpointRestoreDialog({
  open,
  checkpointId,
  files,
  isLoading,
  error,
  isRestoring,
  onOpenChange,
  onConfirm,
}: CheckpointRestoreDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Confirm Revert</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
            <Checkbox checked disabled />
            <span>Reverting the following changes:</span>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <Loader2 className="size-3.5 animate-spin" />
              <span>Loading diff preview…</span>
            </div>
          ) : error ? (
            <div className="rounded border border-[var(--status-error-border)] bg-[var(--status-error-muted)] px-3 py-2 text-xs text-[var(--status-error)]">
              {error}
            </div>
          ) : files.length === 0 ? (
            <div className="rounded border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-muted)]">
              No file changes detected between this checkpoint and current workspace.
            </div>
          ) : (
            <div className="max-h-52 space-y-2 overflow-y-auto rounded border border-[var(--border-subtle)] p-2">
              {files.map((file) => (
                <div key={file.path} className="flex items-center justify-between text-sm">
                  <span className="truncate text-[var(--text-primary)]">{file.path}</span>
                  <span className="shrink-0 font-mono text-xs">
                    <span className="text-[var(--status-success)]">+{file.additions}</span>
                    <span className="mx-1 text-[var(--text-muted)]"> </span>
                    <span className="text-[var(--status-error)]">-{file.deletions}</span>
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="text-xs text-[var(--text-muted)]">
            Target checkpoint: <span className="font-mono">{checkpointId}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isRestoring}>
            Cancel (esc)
          </Button>
          <Button onClick={onConfirm} disabled={isLoading || isRestoring}>
            {isRestoring ? 'Restoring…' : 'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
