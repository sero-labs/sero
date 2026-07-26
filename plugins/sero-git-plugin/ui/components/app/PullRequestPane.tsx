/**
 * Pull request compose — the right-hand pane, not a fourth surface, so history
 * stays visible beside it (§3).
 *
 * Ported from the host's one PR composer (AD-024 / D4). The mechanics are
 * unchanged — branch targets, preview, AI draft, creation over the `pr-*`
 * channels — but it now lives where the design puts it, and the GitHub sign-in
 * prompt is a secondary line here because the top bar owns the action.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { GitBranch, Github, Loader2, Sparkles } from 'lucide-react';
import type { CreatePullRequestResult, PullRequestPreview, PullRequestState } from '@sero-ai/common';
import { seroBridge } from '../../store/sero-bridge';

interface Feedback {
  tone: 'success' | 'error' | 'info';
  message: string;
  url?: string;
}

interface Props {
  workspaceId: string;
  hasRemote: boolean;
  /** Seeds the source branch — the branch you are on. */
  currentBranch?: string | null;
  /** Signed in to GitHub? Creation needs it; drafting and preview do not. */
  authenticated: boolean;
  onClose: () => void;
}

export function PullRequestPane({
  workspaceId, hasRemote, currentBranch, authenticated, onClose,
}: Props) {
  const listId = useId();
  const [prState, setPrState] = useState<PullRequestState | null>(null);
  const [preview, setPreview] = useState<PullRequestPreview | null>(null);
  const [sourceBranch, setSourceBranch] = useState('');
  const [targetBranch, setTargetBranch] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [action, setAction] = useState<'preview' | 'draft' | 'pr' | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const previewRequestRef = useRef(0);

  const loadPrState = useCallback(async () => {
    if (!hasRemote) {
      setPrState(null);
      setPreview(null);
      return;
    }
    try {
      const next = await seroBridge().vcs.prState(workspaceId);
      setPrState(next);
      setSourceBranch((prev) => {
        if (prev && next.sourceBranches.includes(prev)) return prev;
        if (currentBranch
          && next.sourceBranches.includes(currentBranch)
          && currentBranch !== next.defaultBaseBranch) {
          return currentBranch;
        }
        return next.sourceBranches.find((branch) => branch !== next.defaultBaseBranch)
          ?? next.sourceBranches[0]
          ?? '';
      });
      setTargetBranch((prev) => (
        prev && next.targetBranches.includes(prev) ? prev : next.defaultBaseBranch
      ));
    } catch (error) {
      setFeedback({ tone: 'error', message: messageOf(error, 'Failed to load pull request branches') });
      setPrState(null);
      setPreview(null);
    }
  }, [hasRemote, currentBranch, workspaceId]);

  useEffect(() => { void loadPrState(); }, [loadPrState]);

  useEffect(() => {
    if (!prState || !sourceBranch.trim()) {
      setPreview(null);
      return;
    }
    const source = sourceBranch.trim();
    const target = targetBranch.trim() || prState.defaultBaseBranch;
    const requestId = ++previewRequestRef.current;
    setAction('preview');

    const timer = setTimeout(() => {
      void seroBridge().vcs.prPreview(workspaceId, source, target)
        .then((next) => { if (previewRequestRef.current === requestId) setPreview(next); })
        .catch((error) => {
          if (previewRequestRef.current !== requestId) return;
          setPreview(null);
          setFeedback({ tone: 'error', message: messageOf(error, 'Failed to prepare the preview') });
        })
        .finally(() => {
          if (previewRequestRef.current === requestId) {
            setAction((current) => (current === 'preview' ? null : current));
          }
        });
    }, 180);

    return () => clearTimeout(timer);
  }, [prState, sourceBranch, targetBranch, workspaceId]);

  const draft = useCallback(async () => {
    if (!sourceBranch.trim()) return;
    setAction('draft');
    setFeedback(null);
    try {
      const drafted = await seroBridge().vcs.prGenerateDraft(
        workspaceId,
        sourceBranch.trim(),
        targetBranch.trim() || prState?.defaultBaseBranch,
      );
      setTitle(drafted.title);
      setBody(drafted.body);
      setPreview(drafted);
      setFeedback({ tone: 'info', message: `Drafted with ${drafted.model}.` });
    } catch (error) {
      setFeedback({ tone: 'error', message: messageOf(error, 'Failed to draft the pull request') });
    } finally {
      setAction(null);
    }
  }, [prState?.defaultBaseBranch, sourceBranch, targetBranch, workspaceId]);

  const create = useCallback(async () => {
    if (!sourceBranch.trim()) return;
    setAction('pr');
    setFeedback(null);
    try {
      const result: CreatePullRequestResult = await seroBridge().vcs.prCreate(workspaceId, {
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
      if (result.success) await loadPrState();
    } catch (error) {
      setFeedback({ tone: 'error', message: messageOf(error, 'Failed to create the pull request') });
    } finally {
      setAction(null);
    }
  }, [body, loadPrState, prState?.defaultBaseBranch, sourceBranch, targetBranch, title, workspaceId]);

  const hasEligibleSource = Boolean(
    prState?.sourceBranches.some((branch) => branch !== prState.defaultBaseBranch),
  );
  const blocked = !preview?.hasChanges || Boolean(preview?.blockingReason);
  const createDisabled = !title.trim() || !body.trim() || blocked || !authenticated || action === 'pr';

  return (
    <div className="flex size-full min-h-0 flex-col bg-[var(--bg-base)]">
      <PaneHeader onClose={onClose} />

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 git-scrollbar">
        {!hasRemote ? (
          <Note>Publish this repository first. The composer appears once an origin exists.</Note>
        ) : !prState ? (
          <Note><Loader2 className="mr-1.5 inline size-3 animate-spin" />Preparing branch targets…</Note>
        ) : !hasEligibleSource ? (
          <Note>Create and push a branch other than {prState.defaultBaseBranch} first.</Note>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Source">
                <select
                  aria-label="Source branch"
                  value={sourceBranch}
                  onChange={(event) => setSourceBranch(event.target.value)}
                  disabled={action === 'draft' || action === 'pr'}
                  className={`${FIELD} disabled:opacity-40`}
                >
                  <option value="">Select branch</option>
                  {prState.sourceBranches.map((branch) => (
                    <option key={branch} value={branch}>{branch}</option>
                  ))}
                </select>
              </Field>
              <Field label="Target">
                <div className={`${FIELD} flex items-center gap-1`}>
                  <GitBranch className="size-3 shrink-0 text-[var(--text-muted)]" />
                  <input
                    aria-label="Target branch"
                    list={listId}
                    value={targetBranch}
                    onChange={(event) => setTargetBranch(event.target.value)}
                    placeholder={prState.defaultBaseBranch}
                    className="h-full min-w-0 flex-1 bg-transparent outline-none"
                  />
                </div>
                <datalist id={listId}>
                  {prState.targetBranches.map((branch) => (
                    <option key={branch} value={branch}>{branch}</option>
                  ))}
                </datalist>
              </Field>
            </div>

            <PreviewLine
              action={action}
              preview={preview}
              target={targetBranch || prState.defaultBaseBranch}
            />

            <input
              aria-label="Pull request title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Title"
              className={FIELD}
            />
            <textarea
              aria-label="Pull request description"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={8}
              placeholder="What changed, and what should reviewers look at?"
              className="w-full resize-y rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1.5 text-[0.84rem] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--border-focus)]"
            />

            <div className="flex items-center gap-2">
              {/* AI is violet, never green (rule 17). */}
              <button
                type="button"
                onClick={() => void draft()}
                disabled={!sourceBranch.trim() || action === 'draft' || action === 'pr'}
                className="flex h-7 items-center gap-1.5 rounded-md border border-[var(--border-subtle)] px-2.5 text-[0.84rem] text-[var(--brand-secondary)] hover:bg-[var(--bg-elevated)] disabled:opacity-40"
              >
                {action === 'draft'
                  ? <Loader2 className="size-3.5 animate-spin" />
                  : <Sparkles className="size-3.5" />}
                Draft with AI
              </button>
              <button
                type="button"
                onClick={() => void create()}
                disabled={createDisabled}
                className="flex h-7 items-center gap-1.5 rounded-md bg-[var(--brand-primary)] px-2.5 text-[0.84rem] font-medium text-[var(--brand-primary-foreground)] hover:bg-[var(--brand-primary-hover)] disabled:opacity-40"
              >
                {action === 'pr'
                  ? <Loader2 className="size-3.5 animate-spin" />
                  : <Github className="size-3.5" />}
                Create pull request
              </button>
            </div>

            {/* Why the disabled button is disabled, attached to the control. */}
            {!authenticated && (
              <p className="text-xs text-[var(--text-muted)]">
                Opening a pull request needs a GitHub sign-in — the button is in the top bar.
              </p>
            )}

            {feedback && <FeedbackNote feedback={feedback} />}
          </>
        )}
      </div>
    </div>
  );
}

const FIELD = 'h-7 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-[0.84rem] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]';

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function PaneHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3">
      <Github className="size-3.5 text-[var(--text-muted)]" />
      <span className="text-[0.84rem] text-[var(--text-primary)]">Pull request</span>
      <span className="flex-1" />
      <button
        type="button"
        aria-label="Close pull request"
        onClick={onClose}
        className="flex size-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
      >
        ×
      </button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <span className="text-xs text-[var(--text-muted)]">{label}</span>
      {children}
    </label>
  );
}

function PreviewLine({
  action, preview, target,
}: {
  action: string | null;
  preview: PullRequestPreview | null;
  target: string;
}) {
  if (action === 'preview') {
    return <Note><Loader2 className="mr-1.5 inline size-3 animate-spin" />Checking against {target}…</Note>;
  }
  if (preview?.blockingReason) {
    return (
      <p className="rounded-md border border-[var(--status-warning-border)] bg-[var(--status-warning-faint)] px-2.5 py-1.5 text-xs text-[var(--status-warning)]">
        {preview.blockingReason}
      </p>
    );
  }
  if (preview?.existingPr?.url) {
    return (
      <Note>
        Already open as{' '}
        <a href={preview.existingPr.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          #{preview.existingPr.number}
        </a>
      </Note>
    );
  }
  if (preview?.hasChanges) {
    return (
      <Note>
        {preview.changedFiles} changed file{preview.changedFiles === 1 ? '' : 's'} ready for review.
      </Note>
    );
  }
  return <Note>Pick the branches to compare.</Note>;
}

function FeedbackNote({ feedback }: { feedback: Feedback }) {
  const tone = {
    success: 'border-[var(--status-success-border)] bg-[var(--status-success-faint)] text-[var(--status-success)]',
    error: 'border-[var(--status-error-border)] bg-[var(--status-error-faint)] text-[var(--status-error)]',
    info: 'border-[var(--status-info-border)] bg-[var(--status-info-faint)] text-[var(--status-info)]',
  }[feedback.tone];

  return (
    <p className={`rounded-md border px-2.5 py-1.5 text-xs ${tone}`}>
      {feedback.message}
      {feedback.url && (
        <a href={feedback.url} target="_blank" rel="noreferrer" className="ml-2 underline underline-offset-2">
          Open
        </a>
      )}
    </p>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-relaxed text-[var(--text-muted)]">{children}</p>;
}
