import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import { ChevronRight, Github, Loader2, Sparkles } from 'lucide-react';

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

interface GitPullRequestComposerProps {
  workspaceId: string;
  branchLabel: string;
  hasRemote: boolean;
  refreshToken: number;
}

export function GitPullRequestComposer({
  workspaceId,
  branchLabel,
  hasRemote,
  refreshToken,
}: GitPullRequestComposerProps) {
  const [prState, setPrState] = useState<PullRequestState | null>(null);
  const [preview, setPreview] = useState<PullRequestPreview | null>(null);
  const [sourceBranch, setSourceBranch] = useState('');
  const [targetBranch, setTargetBranch] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [action, setAction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<PullRequestFeedback | null>(null);
  const previewRequestRef = useRef(0);

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
        if (branchLabel && nextState.sourceBranches.includes(branchLabel)) return branchLabel;
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
  }, [branchLabel, hasRemote, workspaceId]);

  useEffect(() => {
    setFeedback(null);
    setPrState(null);
    setPreview(null);
    setSourceBranch('');
    setTargetBranch('');
    setTitle('');
    setBody('');
  }, [workspaceId]);

  useEffect(() => {
    void loadPrState();
  }, [loadPrState, refreshToken]);

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

  const createBlocked = !preview?.hasChanges || Boolean(preview?.blockingReason);
  const createDisabled = !title.trim() || !body.trim() || createBlocked || action === 'pr';

  return (
    <section className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/35 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[12px] font-semibold text-[var(--text-primary)]">Pull request</h3>
        <span className="text-[10px] text-[var(--text-muted)]">
          {preview?.changedFiles ? `${preview.changedFiles} files` : 'Draft lane'}
        </span>
      </div>

      {!hasRemote ? (
        <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
          Publish this repository first. Once an origin exists, the PR composer appears here automatically.
        </p>
      ) : !prState ? (
        <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
          <Loader2 className="size-3.5 animate-spin" /> Preparing branch targets…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="space-y-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
              <span>Source</span>
              <select aria-label="Source branch"
                value={sourceBranch}
                onChange={(event) => setSourceBranch(event.target.value)}
                className="h-8 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 text-[11px] text-[var(--text-primary)] outline-none"
              >
                <option value="">Select branch</option>
                {prState.sourceBranches.map((branch) => (
                  <option key={branch} value={branch}>{branch}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
              <span>Target</span>
              <select aria-label="Target branch"
                value={targetBranch}
                onChange={(event) => setTargetBranch(event.target.value)}
                className="h-8 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 text-[11px] text-[var(--text-primary)] outline-none"
              >
                {prState.targetBranches.map((branch) => (
                  <option key={branch} value={branch}>{branch}</option>
                ))}
              </select>
            </label>
          </div>

          <div
            className={cn(
              'rounded-lg border px-2.5 py-2 text-[10px] leading-relaxed',
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
            placeholder="Polish the PR title"
            className="h-8 w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 text-[11px] text-[var(--text-primary)] outline-none"
          />
          <textarea aria-label="Pull request description"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            placeholder="Explain what changed and what reviewers should focus on"
            className="w-full rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-base)] px-3 py-2 text-[11px] text-[var(--text-primary)] outline-none"
          />

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => void handleGenerateDraft()}
              disabled={!sourceBranch.trim() || action === 'draft' || action === 'pr'}
              className="h-8 rounded-lg border border-[var(--border-subtle)] px-3 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-muted)]"
            >
              {action === 'draft' ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Sparkles className="mr-1 size-3.5" />}
              Draft with AI
            </Button>
            <Button
              onClick={() => void handleCreatePr()}
              disabled={createDisabled}
              className="h-8 rounded-lg bg-[var(--accent-primary)] px-3 text-[11px] font-semibold text-[var(--text-inverse)] hover:bg-[var(--accent-hover)]"
            >
              {action === 'pr' ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Github className="mr-1 size-3.5" />}
              Create PR
            </Button>
          </div>
        </>
      )}

      {feedback && (
        <div className={cn(
          'rounded-xl border px-3 py-2 text-[11px] leading-relaxed',
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
              className="ml-2 inline-flex items-center gap-1 underline underline-offset-2"
            >
              Open <ChevronRight className="size-3" />
            </a>
          )}
        </div>
      )}
    </section>
  );
}
