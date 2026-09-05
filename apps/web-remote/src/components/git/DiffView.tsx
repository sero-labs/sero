/**
 * Diff view — one file's changed lines.
 *
 * Lines are rendered rather than highlighted. On a phone the question is
 * "what changed", and colour plus the line numbers answer it. A long diff
 * is cut on the host and says so at the end.
 */

import { ArrowLeft } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { GitDiff, GitDiffLine } from '@/stores/git';

const LINE_TONE: Record<GitDiffLine['type'], string> = {
  add: 'bg-status-success-faint text-[var(--text-primary)]',
  delete: 'bg-status-error-faint text-[var(--text-primary)]',
  context: 'text-[var(--text-secondary)]',
};

const LINE_MARK: Record<GitDiffLine['type'], string> = {
  add: '+',
  delete: '-',
  context: ' ',
};

interface DiffViewProps {
  path: string;
  diff?: GitDiff;
  onBack: () => void;
}

export function DiffView({ path, diff, onBack }: DiffViewProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-2 py-1.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to the file list"
          className="rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="size-4" />
        </button>
        <span className="min-w-0 flex-1 truncate text-xs text-[var(--text-secondary)]" title={path}>
          {path}
        </span>
        {diff && (
          <span className="shrink-0 text-xs tabular-nums">
            <span className="text-status-success">+{diff.additions}</span>{' '}
            <span className="text-status-error">−{diff.deletions}</span>
          </span>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {!diff ? (
          <p className="px-3 py-4 text-xs text-[var(--text-muted)]">Loading the diff…</p>
        ) : diff.binary ? (
          <p className="px-3 py-4 text-xs text-[var(--text-muted)]">
            This is a binary file. There is nothing to show line by line.
          </p>
        ) : diff.hunks.length === 0 ? (
          <p className="px-3 py-4 text-xs text-[var(--text-muted)]">
            No line changes. The file was {diff.status}.
          </p>
        ) : (
          <pre className="w-max min-w-full font-mono text-[11px] leading-[1.45]">
            {diff.hunks.map((hunk, hunkIndex) => (
              <div key={`${hunk.oldStart}-${hunk.newStart}-${hunkIndex}`}>
                <div className="bg-[var(--bg-elevated)] px-2 py-0.5 text-[var(--text-muted)]">
                  @@ -{hunk.oldStart} +{hunk.newStart} @@
                </div>
                {hunk.lines.map((line, lineIndex) => (
                  <div
                    key={`${hunkIndex}-${lineIndex}`}
                    className={cn('flex gap-2 px-2', LINE_TONE[line.type])}
                  >
                    <span className="w-8 shrink-0 select-none text-right text-[var(--text-muted)]">
                      {line.oldLineNo ?? ''}
                    </span>
                    <span className="w-8 shrink-0 select-none text-right text-[var(--text-muted)]">
                      {line.newLineNo ?? ''}
                    </span>
                    <span className="shrink-0 select-none">{LINE_MARK[line.type]}</span>
                    <span className="whitespace-pre">{line.content}</span>
                  </div>
                ))}
              </div>
            ))}
          </pre>
        )}

        {diff?.truncated && (
          <p className="border-t border-[var(--border-subtle)] px-3 py-2 text-xs text-status-warning">
            This diff is too long to send in full. Open the file on the desktop to see the rest.
          </p>
        )}
      </div>
    </div>
  );
}
