/**
 * DiffTab — revision-to-revision changeset viewer built on @pierre/diffs.
 *
 * Shows every changed file in one scrollable view with sticky file headers.
 * The sidebar lists changed files; clicking one scrolls the changeset to it.
 */

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FileText, Columns2, Rows2, Loader2 } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import { useAppStore } from '@/stores/app';
import { useThemeStore } from '@/stores/theme';
import type { FileDiffEntry } from '@sero-ai/common';
import { statusCode, statusColor, basename } from '@/components/apps/explorer/vcs/vcs-utils';
import { DiffChangeset, type DiffChangesetHandle, type DiffStyle } from './DiffChangeset';

export interface DiffTabState {
  type: 'diff';
  workspaceId: string;
  fromRev: string;
  toRev: string;
  initialPath?: string;
}

interface Props {
  state: DiffTabState;
}

export function DiffTab({ state }: Props) {
  const { workspaceId, fromRev, toRev, initialPath } = state;
  const effectiveMode = useThemeStore((s) => s.effectiveMode);
  const editorThemeId = useAppStore((s) => s.editorThemeId);

  const [files, setFiles] = useState<FileDiffEntry[] | null>(null);
  const [activePath, setActivePath] = useState<string | null>(initialPath ?? null);
  const [diffStyle, setDiffStyle] = useState<DiffStyle>('split');
  const [navOpen, setNavOpen] = useState(true);
  const changesetRef = useRef<DiffChangesetHandle>(null);

  // Load the changed-file list for the revision pair.
  useEffect(() => {
    let cancelled = false;
    setFiles(null);
    window.sero.vcs
      .fileDiffSummary(workspaceId, fromRev, toRev)
      .then((f) => { if (!cancelled) setFiles(f); })
      .catch(() => { if (!cancelled) setFiles([]); });
    return () => { cancelled = true; };
  }, [workspaceId, fromRev, toRev]);

  const selectFile = (path: string) => {
    setActivePath(path);
    changesetRef.current?.scrollToFile(path);
  };

  if (files === null) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--bg-base)]">
        <Loader2 className="size-5 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--bg-base)]">
      {/* ── Toolbar ────────────────────────────────────────── */}
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-3">
        <button type="button"
          onClick={() => setNavOpen((v) => !v)}
          title="Toggle file navigator"
          className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          <FileText className="size-3.5" />
        </button>
        <span className="text-sm text-[var(--text-muted)]">
          {files.length === 1 ? '1 file changed' : `${files.length} files changed`}
        </span>
        <span className="text-sm text-[var(--text-muted)]/40">
          {fromRev.slice(0, 8)} → {toRev.slice(0, 8)}
        </span>
        <span className="flex-1" />
        <button type="button"
          onClick={() => setDiffStyle((v) => (v === 'split' ? 'unified' : 'split'))}
          title={diffStyle === 'split' ? 'Unified diff' : 'Side-by-side diff'}
          className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          {diffStyle === 'split' ? <Rows2 className="size-3.5" /> : <Columns2 className="size-3.5" />}
        </button>
      </div>

      {/* ── Body: file nav + changeset ────────────────────── */}
      <div className="flex min-h-0 flex-1">
        <AnimatePresence>
          {navOpen && files.length > 1 && (
            <motion.div
              initial={{ x: -16, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -16, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="w-[180px] shrink-0 overflow-hidden border-r border-[var(--border-subtle)]"
            >
              <div className="h-full w-[180px] overflow-y-auto py-1">
                {files.map((f) => (
                  <button type="button"
                    key={f.path}
                    onClick={() => selectFile(f.path)}
                    className={cn(
                      'flex w-full items-center gap-1.5 px-2 py-0.5 text-left',
                      'transition-colors duration-75',
                      'hover:bg-[var(--bg-elevated)]/60',
                      activePath === f.path && 'bg-[var(--bg-elevated)]',
                    )}
                  >
                    <span className={cn('w-3 shrink-0 text-center text-sm font-bold', statusColor(f.status))}>
                      {statusCode(f.status)}
                    </span>
                    <span className={cn(
                      'min-w-0 truncate text-sm',
                      activePath === f.path ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]',
                    )}>
                      {basename(f.path)}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="min-w-0 flex-1">
          {files.length > 0 ? (
            <DiffChangeset
              key={`${workspaceId}:${fromRev}:${toRev}`}
              ref={changesetRef}
              workspaceId={workspaceId}
              fromRev={fromRev}
              toRev={toRev}
              files={files}
              diffStyle={diffStyle}
              editorThemeId={editorThemeId}
              themeType={effectiveMode}
              initialPath={initialPath}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="text-sm text-[var(--text-muted)]/60">No files to diff</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
