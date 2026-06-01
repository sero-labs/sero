import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { GitBranch, Sparkles, Loader2, Github } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import type {
  Bookmark,
  PullRequestPreview,
  PullRequestState,
} from '@sero-ai/common';
import { VcsSection } from './VcsSection';

interface Props {
  workspaceId: string;
  bookmarks: Bookmark[];
  activePushBookmark?: string | null;
}

export function PullRequestSection({
  workspaceId,
  bookmarks,
  activePushBookmark,
}: Props) {
  const listId = useId();
  const [prState, setPrState] = useState<PullRequestState | null>(null);
  const [preview, setPreview] = useState<PullRequestPreview | null>(null);
  const [sourceBranch, setSourceBranch] = useState('');
  const [targetBranch, setTargetBranch] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loadingState, setLoadingState] = useState(false);
  const [checkingPreview, setCheckingPreview] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createFeedback, setCreateFeedback] = useState<{
    message: string;
    error: boolean;
    url?: string;
  } | null>(null);
  const previewRequestIdRef = useRef(0);

  const localBookmarks = useMemo(
    () => bookmarks.filter((b) => b.isLocal).map((b) => b.name),
    [bookmarks],
  );
  const bookmarkKey = useMemo(
    () => localBookmarks.slice().sort((a, b) => a.localeCompare(b)).join('|'),
    [localBookmarks],
  );

  useEffect(() => {
    let cancelled = false;
    setLoadingState(true);
    void window.sero.vcs
      .prState(workspaceId)
      .then((state) => {
        if (cancelled) return;
        setPrState(state);

        setSourceBranch((prev) => {
          if (prev && state.sourceBranches.includes(prev)) return prev;
          if (activePushBookmark && state.sourceBranches.includes(activePushBookmark) && activePushBookmark !== state.defaultBaseBranch) {
            return activePushBookmark;
          }
          return state.sourceBranches.find((b) => b !== state.defaultBaseBranch) ?? state.sourceBranches[0] ?? '';
        });

        setTargetBranch((prev) => prev.trim() || state.defaultBaseBranch);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[vcs-pr] Failed to load pull request state:', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingState(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workspaceId, bookmarkKey, activePushBookmark]);

  const requestPreview = useDebouncedCallback(
    (nextSourceBranch: string, nextTargetBranch: string, requestId: number) => {
      if (!nextSourceBranch || !nextTargetBranch) {
        if (previewRequestIdRef.current === requestId) {
          setCheckingPreview(false);
        }
        return;
      }

      setCheckingPreview(true);
      void window.sero.vcs
        .prPreview(workspaceId, nextSourceBranch, nextTargetBranch)
        .then((result) => {
          if (previewRequestIdRef.current !== requestId) return;
          setPreview(result);
        })
        .catch((err) => {
          if (previewRequestIdRef.current !== requestId) return;
          console.warn('[vcs-pr] Failed to preview pull request:', err);
          setPreview(null);
        })
        .finally(() => {
          if (previewRequestIdRef.current === requestId) {
            setCheckingPreview(false);
          }
        });
    },
    120,
  );

  useEffect(() => {
    const requestId = previewRequestIdRef.current + 1;
    previewRequestIdRef.current = requestId;
    requestPreview(
      sourceBranch.trim(),
      prState ? targetBranch.trim() || prState.defaultBaseBranch : '',
      requestId,
    );
  }, [prState, requestPreview, sourceBranch, targetBranch, workspaceId]);

  const handleGenerateDraft = useCallback(async () => {
    if (!sourceBranch.trim()) return;
    setGenerating(true);
    try {
      const draft = await window.sero.vcs.prGenerateDraft(
        workspaceId,
        sourceBranch.trim(),
        targetBranch.trim() || prState?.defaultBaseBranch,
      );
      setTitle(draft.title);
      setBody(draft.body);
      setPreview(draft);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to generate PR draft';
      console.warn('[vcs-pr] Failed to generate pull request draft:', err);
      setCreateFeedback({ message: msg, error: true });
    } finally {
      setGenerating(false);
    }
  }, [workspaceId, sourceBranch, targetBranch, prState?.defaultBaseBranch]);

  const handleCreatePr = useCallback(async () => {
    if (!sourceBranch.trim()) return;
    setCreating(true);
    try {
      const result = await window.sero.vcs.prCreate(workspaceId, {
        sourceBranch: sourceBranch.trim(),
        targetBranch: targetBranch.trim() || prState?.defaultBaseBranch || 'main',
        title,
        body,
      });
      setCreateFeedback({ message: result.message, error: !result.success, url: result.url });
      if (result.success) {
        const refreshed = await window.sero.vcs.prPreview(
          workspaceId,
          sourceBranch.trim(),
          targetBranch.trim() || prState?.defaultBaseBranch,
        );
        setPreview(refreshed);
      }
    } catch (err) {
      setCreateFeedback({
        message: err instanceof Error ? err.message : 'Failed to create pull request',
        error: true,
      });
    } finally {
      setCreating(false);
    }
  }, [
    workspaceId,
    sourceBranch,
    targetBranch,
    prState?.defaultBaseBranch,
    title,
    body,
  ]);

  const blockingReason = preview?.blockingReason;
  const hasEligibleSourceBranch = Boolean(
    prState?.sourceBranches.some((branch) => branch !== prState.defaultBaseBranch),
  );
  const canCreate = Boolean(
    sourceBranch.trim()
    && title.trim()
    && body.trim()
    && preview?.hasChanges
    && !blockingReason
    && !creating,
  );

  return (
    <VcsSection
      title="Pull Request"
      defaultOpen
      badge={<Github className="ml-1 size-3 text-[var(--text-muted)]/70" />}
    >
      {!loadingState && prState && !hasEligibleSourceBranch ? (
        <div className="px-2 pb-2">
          <div className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/35 p-2 text-[10px] text-[var(--text-muted)]">
            Pull request creation is disabled until a non-default branch exists.
            Create and push a feature branch first.
          </div>
        </div>
      ) : (
      <div className="space-y-2 px-2 pb-2">
        <div className="grid grid-cols-2 gap-1.5">
          <LabeledSelect
            label="Source"
            value={sourceBranch}
            onChange={setSourceBranch}
            options={prState?.sourceBranches ?? []}
            disabled={loadingState || generating || creating}
          />
          <div className="space-y-1">
            <label htmlFor="pull-request-target-branch" className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]/60">
              Target
            </label>
            <div className="flex items-center gap-1 rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1.5">
              <GitBranch className="size-3 text-[var(--text-muted)]/60" />
              <input
                aria-label="Pull request target branch"
                id="pull-request-target-branch"
                list={listId}
                value={targetBranch}
                onChange={(e) => setTargetBranch(e.target.value)}
                placeholder={prState?.defaultBaseBranch ?? 'main'}
                className="h-6 min-w-0 flex-1 bg-transparent text-[11px] text-[var(--text-primary)] outline-none"
              />
            </div>
            <datalist id={listId}>
              {(prState?.targetBranches ?? []).map((branch) => (
                <option key={branch} value={branch}>{branch}</option>
              ))}
            </datalist>
          </div>
        </div>

        <div
          className={cn(
            'rounded border px-2 py-1 text-[10px]',
            blockingReason
              ? 'border-[var(--status-warning-subtle)] bg-[var(--status-warning-muted)] text-[var(--status-warning)]'
              : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)]/50 text-[var(--text-muted)]',
          )}
        >
          {checkingPreview ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" /> Checking branch diff…
            </span>
          ) : blockingReason ? (
            blockingReason
          ) : preview ? (
            `${preview.changedFiles} changed file${preview.changedFiles === 1 ? '' : 's'} ready for PR.`
          ) : (
            'Select source and target branches to prepare a pull request.'
          )}
          {preview?.existingPr?.url && (
            <a
              href={preview.existingPr.url}
              target="_blank"
              rel="noreferrer"
              className="ml-1 text-[var(--status-info)] underline"
            >
              Open existing PR #{preview.existingPr.number}
            </a>
          )}
        </div>

        <input aria-label="PR title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="PR title"
          className={cn(
            'h-7 w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2',
            'text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]',
          )}
        />

        <textarea aria-label="PR description"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="PR description"
          rows={6}
          className={cn(
            'w-full resize-y rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-2 py-1.5',
            'text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]',
          )}
        />

        <div className="flex items-center gap-1.5">
          <button type="button"
            onClick={() => void handleGenerateDraft()}
            disabled={generating || creating || !sourceBranch.trim()}
            className={cn(
              'flex h-7 items-center gap-1 rounded px-2 text-[11px] font-medium',
              'bg-[var(--bg-elevated)] text-[var(--text-secondary)]',
              'hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]',
              'transition-colors disabled:opacity-40',
            )}
          >
            {generating ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
            Generate draft
          </button>
          <button type="button"
            onClick={() => void handleCreatePr()}
            disabled={!canCreate}
            className={cn(
              'flex h-7 items-center gap-1 rounded px-2.5 text-[11px] font-semibold',
              'bg-[var(--status-info-border)] text-[var(--status-info)] ring-1 ring-[var(--status-info-subtle)]',
              'hover:bg-[var(--status-info-subtle)] hover:text-[var(--status-info)]',
              'transition-colors disabled:opacity-40',
            )}
          >
            {creating ? <Loader2 className="size-3 animate-spin" /> : <Github className="size-3" />}
            Create PR
          </button>
        </div>

        {createFeedback && (
          <div
            className={cn(
              'rounded px-2 py-1 text-[10px]',
              createFeedback.error ? 'bg-[var(--status-error-muted)] text-[var(--status-error)]' : 'bg-[var(--status-success-muted)] text-[var(--status-success)]',
            )}
          >
            {createFeedback.message}
            {createFeedback.url && (
              <a href={createFeedback.url} target="_blank" rel="noreferrer" className="ml-1 underline">
                Open
              </a>
            )}
          </div>
        )}
      </div>
      )}
    </VcsSection>
  );
}

function LabeledSelect({
  label,
  value,
  onChange,
  options,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]/60">
        {label}
      </label>
      <select aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          'h-6 w-full rounded border border-[var(--border-subtle)] bg-[var(--bg-base)] px-1.5',
          'text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]',
          'disabled:opacity-40',
        )}
      >
        <option value="">Select branch</option>
        {options.map((branch) => (
          <option key={branch} value={branch}>
            {branch}
          </option>
        ))}
      </select>
    </div>
  );
}
