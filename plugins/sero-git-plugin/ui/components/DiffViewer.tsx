/**
 * Diff viewer, syntax-highlighted unified diff display.
 *
 * Shows hunks with line numbers, additions (green),
 * deletions (red), and context lines. Supports a close action.
 */

import type { FileDiff, DiffHunk, DiffLine } from '../../shared/types';

interface DiffViewerProps {
  diff: FileDiff | null;
  onClose: () => void;
}

export function DiffViewer({ diff, onClose }: DiffViewerProps) {
  if (!diff) return null;

  if (diff.binary) {
    return (
      <DiffShell path={diff.path} diff={diff} onClose={onClose}>
        <div className="flex items-center justify-center py-12 text-[var(--g-dim)] text-xs">
          Binary file, cannot display diff
        </div>
      </DiffShell>
    );
  }

  if (diff.hunks.length === 0) {
    return (
      <DiffShell path={diff.path} diff={diff} onClose={onClose}>
        <div className="flex items-center justify-center py-12 text-[var(--g-dim)] text-xs">
          {diff.oldPath && diff.oldPath !== diff.path
            ? `Renamed without content changes: ${diff.oldPath} → ${diff.path}`
            : 'No changes'}
        </div>
      </DiffShell>
    );
  }

  return (
    <DiffShell path={diff.path} diff={diff} onClose={onClose}>
      <div className="overflow-auto git-scrollbar max-h-96">
        {diff.hunks.map((hunk, i) => (
          <HunkView key={`${hunk.oldStart}-${hunk.newStart}-${hunk.oldCount}-${hunk.newCount}`} hunk={hunk} index={i} />
        ))}
      </div>
    </DiffShell>
  );
}

// ── Diff shell (header + container) ─────────────────────────

function DiffShell({
  path, diff, onClose, children,
}: {
  path: string; diff: FileDiff; onClose: () => void; children: React.ReactNode;
}) {
  const statusColor = {
    added: 'var(--g-green)',
    modified: 'var(--g-yellow)',
    deleted: 'var(--g-red)',
    renamed: 'var(--g-blue)',
    copied: 'var(--g-blue)',
    untracked: 'var(--g-dim)',
  }[diff.status];

  return (
    <div className="border border-[var(--g-border)] rounded-lg bg-[var(--g-bg)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--g-border)] bg-[var(--g-surface)]">
        <div className="min-w-0 flex items-center gap-2">
          <span
            className="size-2 rounded-full shrink-0"
            style={{ background: statusColor }}
          />
          <div className="min-w-0">
            <div className="truncate text-xs text-[var(--g-text)] git-mono">{path}</div>
            {diff.oldPath && diff.oldPath !== path && (
              <div className="truncate text-[10px] text-[var(--g-dim)] git-mono">
                {diff.oldPath} → {path}
              </div>
            )}
          </div>
          <div className="ml-2 flex items-center gap-1.5">
            {diff.additions > 0 && (
              <span className="text-[10px] text-[var(--g-green)] font-medium">+{diff.additions}</span>
            )}
            {diff.deletions > 0 && (
              <span className="text-[10px] text-[var(--g-red)] font-medium">-{diff.deletions}</span>
            )}
          </div>
        </div>
        <button type="button"
          aria-label="Close diff"
          onClick={onClose}
          className="p-1 text-[var(--g-dim)] hover:text-[var(--g-text)] transition-colors cursor-pointer"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>

      {children}
    </div>
  );
}

// ── Hunk view ───────────────────────────────────────────────

function HunkView({ hunk, index }: { hunk: DiffHunk; index: number }) {
  return (
    <div>
      {/* Hunk header */}
      <div className="diff-hunk px-3 py-1 text-[10px] git-mono select-none border-b border-[var(--g-border)]">
        @@ -{hunk.oldStart},{hunk.oldCount} +{hunk.newStart},{hunk.newCount} @@
        {index > 0 && <span className="ml-2 text-[var(--g-dim)]">Hunk #{index + 1}</span>}
      </div>

      {/* Lines */}
      <div className="font-[var(--g-mono)] text-[11px] leading-[1.6]">
        {hunk.lines.map((line) => (
          <LineView key={`${line.oldLineNo ?? ''}-${line.newLineNo ?? ''}-${line.type}-${line.content}`} line={line} />
        ))}
      </div>
    </div>
  );
}

// ── Line view ───────────────────────────────────────────────

function LineView({ line }: { line: DiffLine }) {
  const bgClass = line.type === 'add' ? 'diff-add' : line.type === 'delete' ? 'diff-del' : '';
  const textClass = line.type === 'add' ? 'diff-add-text' : line.type === 'delete' ? 'diff-del-text' : 'text-[var(--g-text)]';
  const prefix = line.type === 'add' ? '+' : line.type === 'delete' ? '-' : ' ';

  return (
    <div className={`flex ${bgClass} hover:brightness-110`}>
      {/* Old line number */}
      <span className="w-10 shrink-0 text-right pr-1 text-[10px] text-[var(--g-dim)] select-none git-mono opacity-50">
        {line.oldLineNo ?? ''}
      </span>
      {/* New line number */}
      <span className="w-10 shrink-0 text-right pr-2 text-[10px] text-[var(--g-dim)] select-none git-mono opacity-50">
        {line.newLineNo ?? ''}
      </span>
      {/* Prefix */}
      <span className={`w-4 shrink-0 text-center select-none ${textClass} opacity-60 git-mono`}>
        {prefix}
      </span>
      {/* Content */}
      <span className={`flex-1 ${textClass} git-mono whitespace-pre`}>
        {line.content}
      </span>
    </div>
  );
}
