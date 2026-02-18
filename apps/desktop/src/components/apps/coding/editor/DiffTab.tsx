/**
 * DiffTab — Monaco DiffEditor for comparing file contents between revisions.
 *
 * Renders a side-by-side (or inline) diff view with full syntax highlighting,
 * char-level diff decorations, and minimap.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { AnimatePresence, motion } from 'motion/react';
import {
  FileText,
  Columns2,
  Rows2,
  ChevronUp,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/app';
import type { FileDiffEntry } from '@/types/vcs';
import { statusCode, statusColor, basename, langFromPath } from '../vcs/vcs-utils';

export interface DiffTabState {
  /** Marker for tab bar rendering — distinguishes from regular file tabs. */
  type: 'diff';
  workspaceId: string;
  fromRev: string;
  toRev: string;
  /** If set, show only this file. Otherwise show the first file from the summary. */
  initialPath?: string;
}

interface Props {
  state: DiffTabState;
}

export function DiffTab({ state }: Props) {
  const { workspaceId, fromRev, toRev, initialPath } = state;
  const theme = useAppStore((s) => s.theme);

  const [files, setFiles] = useState<FileDiffEntry[]>([]);
  const [activePath, setActivePath] = useState<string | null>(initialPath ?? null);
  const [leftContent, setLeftContent] = useState('');
  const [rightContent, setRightContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [fileLoading, setFileLoading] = useState(false);
  const [sideBySide, setSideBySide] = useState(true);
  const [navOpen, setNavOpen] = useState(true);

  const diffEditorRef = useRef<any>(null);

  // Load file list
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    window.sero.vcs
      .fileDiffSummary(workspaceId, fromRev, toRev)
      .then((f) => {
        if (cancelled) return;
        setFiles(f);
        // Auto-select first file if no initial path
        if (!activePath && f.length > 0) {
          setActivePath(f[0].path);
        }
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, fromRev, toRev]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load file content when active path changes
  useEffect(() => {
    if (!activePath) return;
    let cancelled = false;
    setFileLoading(true);

    Promise.all([
      window.sero.vcs.fileContent(workspaceId, fromRev, activePath).catch(() => ''),
      window.sero.vcs.fileContent(workspaceId, toRev, activePath).catch(() => ''),
    ]).then(([left, right]) => {
      if (cancelled) return;
      setLeftContent(left);
      setRightContent(right);
      setFileLoading(false);
    });

    return () => { cancelled = true; };
  }, [workspaceId, fromRev, toRev, activePath]);

  const goToNextDiff = useCallback(() => {
    diffEditorRef.current?.goToDiff?.('next');
  }, []);

  const goToPrevDiff = useCallback(() => {
    diffEditorRef.current?.goToDiff?.('previous');
  }, []);

  const handleEditorMount = useCallback((editor: any) => {
    diffEditorRef.current = editor;
  }, []);

  const language = activePath ? langFromPath(activePath) : 'plaintext';

  if (loading) {
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
        <button
          onClick={() => setNavOpen((v) => !v)}
          title="Toggle file navigator"
          className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          <FileText className="size-3.5" />
        </button>
        <span className="text-[11px] text-[var(--text-muted)]">
          {activePath ? basename(activePath) : 'No files'}
        </span>
        <span className="text-[10px] text-[var(--text-muted)]/40">
          {fromRev.slice(0, 8)} → {toRev.slice(0, 8)}
        </span>
        <span className="flex-1" />
        <button
          onClick={goToPrevDiff}
          title="Previous change"
          className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          <ChevronUp className="size-3.5" />
        </button>
        <button
          onClick={goToNextDiff}
          title="Next change"
          className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          <ChevronDown className="size-3.5" />
        </button>
        <button
          onClick={() => setSideBySide((v) => !v)}
          title={sideBySide ? 'Inline diff' : 'Side-by-side diff'}
          className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          {sideBySide ? <Rows2 className="size-3.5" /> : <Columns2 className="size-3.5" />}
        </button>
      </div>

      {/* ── Body: file nav + diff editor ──────────────────── */}
      <div className="flex min-h-0 flex-1">
        {/* File navigator */}
        <AnimatePresence>
          {navOpen && files.length > 1 && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 180, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden border-r border-[var(--border-subtle)]"
            >
              <div className="h-full w-[180px] overflow-y-auto py-1">
                {files.map((f, i) => (
                  <button
                    key={f.path}
                    onClick={() => setActivePath(f.path)}
                    className={cn(
                      'flex w-full items-center gap-1.5 px-2 py-0.5 text-left',
                      'transition-colors duration-75',
                      'hover:bg-[var(--bg-elevated)]/60',
                      activePath === f.path && 'bg-[var(--bg-elevated)]',
                    )}
                  >
                    <span className={cn('w-3 shrink-0 text-center text-[10px] font-bold', statusColor(f.status))}>
                      {statusCode(f.status)}
                    </span>
                    <span className={cn(
                      'min-w-0 truncate text-[11px]',
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

        {/* Monaco DiffEditor */}
        <div className="min-w-0 flex-1">
          {fileLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-4 animate-spin text-[var(--text-muted)]" />
            </div>
          ) : (
            <DiffEditor
              original={leftContent}
              modified={rightContent}
              language={language}
              theme={theme === 'dark' ? 'vs-dark' : 'vs'}
              onMount={handleEditorMount}
              options={{
                readOnly: true,
                renderSideBySide: sideBySide,
                minimap: { enabled: true },
                scrollBeyondLastLine: false,
                fontSize: 12,
                lineNumbers: 'on',
                renderOverviewRuler: true,
                diffWordWrap: 'on',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
