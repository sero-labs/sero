/**
 * The one PR composer (AD-024 / D4) — mounted by both the titlebar Ship deck
 * and the explorer VCS panel. Hosts provide the surrounding container; this
 * component owns branch targets, preview, AI draft, and creation against the
 * sero:vcs:pr-* channels.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { GitBranch, Github, Loader2, Sparkles } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';

import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import type {
  CreatePullRequestResult,
  PullRequestPreview,
  PullRequestState,
} from '@sero-ai/common';

interface PullRequestFeedback {
  tone: 'success' | 'error' | 'info';
  message: string;
  url?: string;
}

export interface PullRequestComposerProps {
  workspaceId: string;
  hasRemote: boolean;
  /** Preferred source-branch seed (current branch / active push branch). */
  preferredSourceBranch?: string | null;
  /** Change to reload branch targets (branch list key, refresh counter …). */
  refreshKey?: string | number;
  /** Denser styling for the explorer side panel. */
  compact?: boolean;
}

export function PullRequestComposer({
  workspaceId,
  hasRemote,
  preferredSourceBranch,
  refreshKey,
  compact = false,
}: PullRequestComposerProps) {
  const listId = useId();
  const [prState, setPrState] = useState<PullRequestState | null>(null);
  const [preview, setPreview] = useState<PullRequestPreview | null>(null);
  const [sourceBranch, setSourceBranch] = useState('');
  const [targetBranch, setTargetBranch] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [action, setAction] = useState<'preview' | 'draft' | 'pr' | null>(null);
  const [feedback, setFeedback] = useState<PullRequestFeedback | null>(null);
  const previewRequestRef = useRef(0);

  useEffect(() => {
    setFeedback(null);
    setPrState(null);
    setPreview(null);
    setSourceBranch('');
    setTargetBranch('');
    setTitle('');
    setBody('');
  }, [workspaceId]);

  const loadPrState = useCallback(async () => {
    if (!hasRemote) {
      setPrState(null);
      setPreview(null);
      return;
    }

    try {
      const nextState = await window.sero.vcs.prState(workspaceId);
      setPrState(nextState);
      setSourceBranch((prev) => {
        if (prev && nextState.sourceBranches.includes(prev)) return prev;
        if (
          preferredSourceBranch
          && nextState.sourceBranches.includes(preferredSourceBranch)
          && preferredSourceBranch !== nextState.defaultBaseBranch
        ) {
          return preferredSourceBranch;
        }
        return nextState.sourceBranches.find((branch) => branch !== nextState.defaultBaseBranch)
          ?? nextState.sourceBranches[0]
          ?? '';
      });
      setTargetBranch((prev) => {
        if (prev && nextState.targetBranches.includes(prev)) return prev;
        return nextState.defaultBaseBranch;
      });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to load pull request branches',
      });
      setPrState(null);
      setPreview(null);
    }
  }, [hasRemote, preferredSourceBranch, workspaceId]);

  useEffect(() => {
    void loadPrState();
  }, [loadPrState, refreshKey]);

  const requestPreview = useCallback(async (source: string, target: string) => {
    const requestId = ++previewRequestRef.current;
    setAction('preview');
    try {
      const nextPreview = await window.sero.vcs.prPreview(workspaceId, source, target);
      if (previewRequestRef.current !== requestId) return;
      setPreview(nextPreview);
    } catch (error) {
      if (previewRequestRef.current !== requestId) return;
      setPreview(null);
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to prepare pull request preview',
      });
    } finally {
      if (previewRequestRef.current === requestId) {
        setAction((current) => (current === 'preview' ? null : current));
      }
    }
  }, [workspaceId]);

  const debouncedPreview = useDebouncedCallback((source: string, target: string) => {
    void requestPreview(source, target);
  }, 180);

  useEffect(() => {
    if (!prState || !sourceBranch.trim()) {
      setPreview(null);
      return;
    }
    debouncedPreview(sourceBranch.trim(), targetBranch.trim() || prState.defaultBaseBranch);
  }, [debouncedPreview, prState, sourceBranch, targetBranch]);

  const handleGenerateDraft = useCallback(async () => {
    if (!sourceBranch.trim()) return;
    setAction('draft');
    setFeedback(null);
    try {
      const draft = await window.sero.vcs.prGenerateDraft(
        workspaceId,
        sourceBranch.trim(),
        targetBranch.trim() || prState?.defaultBaseBranch,
      );
      setTitle(draft.title);
      setBody(draft.body);
      setPreview(draft);
      setFeedback({ tone: 'info', message: `Drafted with ${draft.model}.` });
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to draft pull request',
      });
    } finally {
      setAction(null);
    }
  }, [prState?.defaultBaseBranch, sourceBranch, targetBranch, workspaceId]);

  const handleCreatePr = useCallback(async () => {
    if (!sourceBranch.trim()) return;
    setAction('pr');
    setFeedback(null);
    try {
      const result: CreatePullRequestResult = await window.sero.vcs.prCreate(workspaceId, {
        sourceBranch: sourceBranch.trim(),
        targetBranch: targetBranch.trim() || prState?.defaultBaseBranch || 'main',
        title,
        body,
      });
      setFeedback({
        tone: result.success ? 'success' : 'error',
        message: result.message,
        url: result.url,
      });
      if (result.success) {
        await loadPrState();
        const refreshed = await window.sero.vcs.prPreview(
          workspaceId,
          sourceBranch.trim(),
          targetBranch.trim() || prState?.defaultBaseBranch,
        );
        setPreview(refreshed);
      }
    } catch (error) {
      setFeedback({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to create pull request',
      });
    } finally {
      setAction(null);
    }
  }, [body, loadPrState, prState?.defaultBaseBranch, sourceBranch, targetBranch, title, workspaceId]);

  const hasEligibleSourceBranch = Boolean(
    prState?.sourceBranches.some((branch) => branch !== prState.defaultBaseBranch),
  );
  const createBlocked = !preview?.hasChanges || Boolean(preview?.blockingReason);
  const createDisabled = !title.trim() || !body.trim() || createBlocked || action === 'pr';
  const fieldClass = cn(
    'w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]',
    compact ? 'h-7 px-2' : 'h-8 px-3',
  );

  if (!hasRemote) {
    return (
      <p className="text-sm leading-relaxed text-[var(--text-muted)]">
        Publish this repository first. Once an origin exists, the PR composer appears here automatically.
      </p>
    );
  }

  if (!prState) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <Loader2 className="size-3.5 animate-spin" /> Preparing branch targets…
      </div>
    );
  }

  if (!hasEligibleSourceBranch) {
    return (
      <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/35 p-2 text-sm text-[var(--text-muted)]">
        Pull request creation is disabled until a non-default branch exists.
        Create and push a feature branch first.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 text-sm uppercase tracking-wide text-[var(--text-muted)]/70">
          <span>Source</span>
          <select aria-label="Source branch"
            value={sourceBranch}
            onChange={(event) => setSourceBranch(event.target.value)}
            disabled={action === 'draft' || action === 'pr'}
            className={cn(fieldClass, 'disabled:opacity-40')}
          >
            <option value="">Select branch</option>
            {prState.sourceBranches.map((branch) => (
              <option key={branch} value={branch}>{branch}</option>
            ))}
          </select>
        </label>
        <div className="space-y-1 text-sm uppercase tracking-wide text-[var(--text-muted)]/70">
          <label htmlFor={`${listId}-target`}>Target</label>
          <div className={cn(fieldClass, 'flex items-center gap-1')}>
            <GitBranch className="size-3 shrink-0 text-[var(--text-muted)]/60" />
            <input
              aria-label="Target branch"
              id={`${listId}-target`}
              list={listId}
              value={targetBranch}
              onChange={(event) => setTargetBranch(event.target.value)}
              placeholder={prState.defaultBaseBranch}
              className="h-full min-w-0 flex-1 bg-transparent normal-case outline-none"
            />
          </div>
          <datalist id={listId}>
            {prState.targetBranches.map((branch) => (
              <option key={branch} value={branch}>{branch}</option>
            ))}
          </datalist>
        </div>
      </div>

      <div
        className={cn(
          'rounded-lg border px-2.5 py-2 text-sm leading-relaxed',
          preview?.blockingReason
            ? 'border-status-warning-border bg-status-warning-faint text-status-warning'
            : 'border-[var(--border-subtle)] bg-[var(--bg-base)] text-[var(--text-muted)]',
        )}
      >
        {action === 'preview' ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="size-3 animate-spin" /> Checking diff against {targetBranch || prState.defaultBaseBranch}...
          </span>
        ) : preview?.blockingReason ? (
          preview.blockingReason
        ) : preview?.existingPr?.url ? (
          <span>
            Existing PR ready at{' '}
            <a href={preview.existingPr.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
              #{preview.existingPr.number}
            </a>
          </span>
        ) : preview?.hasChanges ? (
          `${preview.changedFiles} changed file${preview.changedFiles === 1 ? '' : 's'} ready for review.`
        ) : (
          'Select source and target branches to generate a pull request.'
        )}
      </div>

      <input aria-label="Pull request title"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="PR title"
        className={fieldClass}
      />
      <textarea aria-label="Pull request description"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={compact ? 6 : 4}
        placeholder="Explain what changed and what reviewers should focus on"
        className="w-full resize-y rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
      />

      <div className="flex items-center gap-2">
        <button type="button"
          onClick={() => void handleGenerateDraft()}
          disabled={!sourceBranch.trim() || action === 'draft' || action === 'pr'}
          className={cn(
            'flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] px-3 text-sm font-medium',
            'text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-muted)] disabled:opacity-40',
            compact ? 'h-7' : 'h-8',
          )}
        >
          {action === 'draft' ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          Draft with AI
        </button>
        <button type="button"
          onClick={() => void handleCreatePr()}
          disabled={createDisabled}
          className={cn(
            'flex items-center gap-1 rounded-lg px-3 text-sm font-semibold',
            'bg-[var(--brand-primary)] text-[var(--brand-primary-foreground)] ring-1 ring-[var(--brand-primary-border)]',
            'transition-colors hover:bg-[var(--brand-primary-hover)] disabled:opacity-40',
            compact ? 'h-7' : 'h-8',
          )}
        >
          {action === 'pr' ? <Loader2 className="size-3.5 animate-spin" /> : <Github className="size-3.5" />}
          Create PR
        </button>
      </div>

      {feedback && (
        <div className={cn(
          'rounded-lg border px-3 py-2 text-sm leading-relaxed',
          feedback.tone === 'success' && 'border-status-success-border bg-status-success-faint text-status-success',
          feedback.tone === 'error' && 'border-status-error-border bg-status-error-faint text-status-error',
          feedback.tone === 'info' && 'border-status-info-border bg-status-info-faint text-status-info',
        )}>
          <span>{feedback.message}</span>
          {feedback.url && (
            <a
              href={feedback.url}
              target="_blank"
              rel="noreferrer"
              className="ml-2 underline underline-offset-2"
            >
              Open
            </a>
          )}
        </div>
      )}
    </div>
  );
}
