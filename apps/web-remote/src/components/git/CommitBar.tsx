/**
 * Commit bar — the message, the count, and the confirm step.
 *
 * Committing is the only gateway action that changes a repository, so it
 * asks once before it runs and names exactly what it will commit.
 */

import { useState } from 'react';
import { GitCommit, Loader2 } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Textarea } from '@sero-ai/ui/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@sero-ai/ui/components/ui/alert-dialog';
import { useGitStore } from '@/stores/git';

interface CommitBarProps {
  workspaceId: string;
  branch: string;
}

export function CommitBar({ workspaceId, branch }: CommitBarProps) {
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const selectedPaths = useGitStore((s) => s.selectedPaths);
  const committing = useGitStore((s) => s.committing);
  const lastCommit = useGitStore((s) => s.lastCommit);
  const error = useGitStore((s) => s.error);
  const commit = useGitStore((s) => s.commit);

  const ready = selectedPaths.length > 0 && message.trim().length > 0 && !committing;

  const runCommit = () => {
    setConfirming(false);
    commit(workspaceId, message);
    setMessage('');
  };

  return (
    <div className="shrink-0 border-t border-[var(--border-subtle)] p-2">
      <Textarea
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        placeholder="Commit message"
        aria-label="Commit message"
        rows={2}
        className="min-h-0 resize-none text-sm"
      />

      <div className="flex items-center gap-2 pt-2">
        <span className="flex-1 truncate text-xs text-[var(--text-muted)]">
          {selectedPaths.length} of the changed files selected
        </span>
        <Button size="sm" disabled={!ready} onClick={() => setConfirming(true)}>
          {committing ? <Loader2 className="size-3.5 animate-spin" /> : <GitCommit className="size-3.5" />}
          Commit
        </Button>
      </div>

      {lastCommit && (
        <p className="pt-2 text-xs text-status-success">
          Committed {lastCommit.hash} to {lastCommit.branch} · {lastCommit.fileCount}{' '}
          {lastCommit.fileCount === 1 ? 'file' : 'files'}
        </p>
      )}

      {error && <p className="pt-2 text-xs text-status-error">{error}</p>}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Commit {selectedPaths.length} files?</AlertDialogTitle>
            <AlertDialogDescription>
              This commits {selectedPaths.length}{' '}
              {selectedPaths.length === 1 ? 'file' : 'files'} to {branch || 'the current branch'}.
              Nothing is pushed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={runCommit}>Commit</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
