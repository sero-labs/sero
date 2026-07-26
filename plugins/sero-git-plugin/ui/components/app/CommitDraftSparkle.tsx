/**
 * The sparkle inside the commit message field (§5, §10).
 *
 * Deliberately *inside* the field rather than beside Commit: it fills that
 * field in, so it belongs to it, and a second button next to Commit would
 * compete with the one green action (rule 16). It spins in place and the
 * message appears — no toast and no status line, because the result is the
 * field's new contents.
 *
 * The scope is the surface's own definition of what it commits: the Git app
 * commits what is staged, the popover commits the lot. Passing the wrong one
 * drafts a message about changes the commit will not contain.
 */

import { useCallback, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { seroBridge } from '../../store/sero-bridge';

export type CommitDraftScope = 'staged' | 'all';

interface DraftState {
  drafting: boolean;
  error: string | null;
  draft: () => void;
}

/**
 * `onMessage` receives the drafted message. An empty draft never reaches it —
 * the model having nothing to say must not wipe what you already typed.
 */
export function useCommitDraft(
  workspaceId: string,
  scope: CommitDraftScope,
  onMessage: (message: string) => void,
): DraftState {
  const [drafting, setDrafting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft = useCallback(() => {
    setDrafting(true);
    setError(null);
    void seroBridge().vcs
      .commitDraftMessage(workspaceId, scope)
      .then((message) => {
        if (message.trim()) onMessage(message);
        else setError('No message came back. Try again, or write one.');
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Could not draft a message.');
      })
      .finally(() => setDrafting(false));
  }, [onMessage, scope, workspaceId]);

  return { drafting, error, draft };
}

/** Positioned by its container, which must be `relative` and pad the field for it. */
export function CommitDraftSparkle({
  drafting, disabled, onClick,
}: {
  drafting: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label="Draft a commit message"
      title="Draft a commit message"
      onClick={onClick}
      disabled={disabled || drafting}
      // Violet on hover: AI is never green (rule 17). At rest it is muted, so
      // it never competes with the commit button beneath it (rule 16).
      className="absolute right-[5px] top-[5px] flex size-[21px] items-center justify-center rounded-[5px] text-[var(--text-muted)] transition-colors hover:bg-[var(--brand-secondary-faint)] hover:text-[var(--brand-secondary)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-[var(--text-muted)]"
    >
      {drafting
        ? <Loader2 className="size-3.5 animate-spin" />
        : <Sparkles className="size-3.5" />}
    </button>
  );
}
