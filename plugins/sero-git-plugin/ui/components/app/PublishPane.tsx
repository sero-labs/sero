/**
 * Publish to GitHub — what fills the pull-request slot while the repository
 * has no origin (§7).
 *
 * A pull request needs somewhere to send it, so offering one here would be a
 * dead end. This is the step that actually comes first.
 */

import { useCallback, useState } from 'react';
import { GitFork, Loader2 } from 'lucide-react';
import { seroGitHub } from '../../store/sero-bridge';

interface Props {
  workspaceId: string;
  /** Seeds the repository name. */
  repoName: string;
  /** Creating a repository needs a sign-in; the button for it is in the top bar. */
  authenticated: boolean;
  onClose: () => void;
  /** Called after a successful publish, so the app can pick up the new remote. */
  onPublished: () => void;
}

export function PublishPane({
  workspaceId, repoName, authenticated, onClose, onPublished,
}: Props) {
  const [name, setName] = useState(repoName);
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string; url?: string } | null>(null);

  const publish = useCallback(async () => {
    const github = seroGitHub();
    if (!github || !name.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const created = await github.createRepo(workspaceId, {
        name: name.trim(),
        visibility,
        addRemote: true,
      });
      setResult({ ok: created.success, message: created.message, url: created.url });
      if (created.success) onPublished();
    } catch (error) {
      setResult({
        ok: false,
        message: error instanceof Error ? error.message : 'Could not create the repository',
      });
    } finally {
      setBusy(false);
    }
  }, [name, onPublished, visibility, workspaceId]);

  return (
    <div className="flex size-full min-h-0 flex-col bg-[var(--bg-base)]">
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3">
        <GitFork className="size-3.5 text-[var(--text-muted)]" />
        <span className="text-[0.84rem] text-[var(--text-primary)]">Publish to GitHub</span>
        <span className="flex-1" />
        <button
          type="button"
          aria-label="Close publish"
          onClick={onClose}
          className="flex size-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
        >
          ×
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3 git-scrollbar">
        <label className="block space-y-1">
          <span className="text-xs text-[var(--text-muted)]">Repository name</span>
          <input
            aria-label="Repository name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="h-7 w-full rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 text-[0.84rem] text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
          />
        </label>

        <div className="flex gap-1.5">
          {(['private', 'public'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setVisibility(option)}
              className={`h-7 flex-1 rounded-md border text-[0.84rem] capitalize ${
                visibility === option
                  ? 'border-[var(--border-default)] bg-[var(--bg-elevated)] text-[var(--text-primary)]'
                  : 'border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void publish()}
          disabled={!authenticated || !name.trim() || busy}
          className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md bg-[var(--brand-primary)] text-[0.84rem] font-medium text-[var(--brand-primary-foreground)] hover:bg-[var(--brand-primary-hover)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <GitFork className="size-3.5" />}
          Create repository and push
        </button>

        {/* Why the button is off, attached to the control (rule 20). */}
        {!authenticated && (
          <p className="text-xs text-[var(--text-muted)]">
            Publishing needs a GitHub sign-in — the button is in the top bar.
          </p>
        )}

        {result && (
          <p className={`rounded-md border px-2.5 py-1.5 text-xs ${
            result.ok
              ? 'border-[var(--status-success-border)] bg-[var(--status-success-faint)] text-[var(--status-success)]'
              : 'border-[var(--status-error-border)] bg-[var(--status-error-faint)] text-[var(--status-error)]'
          }`}>
            {result.message}
            {result.url && (
              <a href={result.url} target="_blank" rel="noreferrer" className="ml-2 underline underline-offset-2">
                Open
              </a>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
