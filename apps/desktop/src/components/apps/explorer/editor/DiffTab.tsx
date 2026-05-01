/**
 * DiffTab — Monaco DiffEditor for comparing file contents between revisions.
 *
 * Renders a side-by-side (or inline) diff view with full syntax highlighting,
 * char-level diff decorations, and minimap.
 *
 * The DiffEditor is keyed on `activePath` so React fully unmounts/remounts it
 * on file switch — this avoids Monaco's "TextModel got disposed before
 * DiffEditorWidget model got reset" error that happens when swapping models
 * on a live widget.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import type { editor as MonacoEditor } from 'monaco-editor';
import { AnimatePresence, motion } from 'motion/react';
import {
  FileText,
  Columns2,
  Rows2,
  ChevronUp,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import { useAppStore } from '@/stores/app';
import { useThemeStore } from '@/stores/theme';
import { resolveMonacoThemeName } from './monaco-themes';
import type { FileDiffEntry } from '@sero-ai/common';
import { statusCode, statusColor, basename, langFromPath } from '@/components/apps/explorer/vcs/vcs-utils';

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
  const monacoThemeName = resolveMonacoThemeName(editorThemeId, effectiveMode);

  const [files, setFiles] = useState<FileDiffEntry[]>([]);
  const [activePath, setActivePath] = useState<string | null>(initialPath ?? null);
  const [loading, setLoading] = useState(true);
  const [sideBySide, setSideBySide] = useState(true);
  const [navOpen, setNavOpen] = useState(true);

  // Load file list
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    window.sero.vcs
      .fileDiffSummary(workspaceId, fromRev, toRev)
      .then((f) => {
        if (cancelled) return;
        setFiles(f);
        if (!activePath && f.length > 0) setActivePath(f[0].path);
        setLoading(false);
      })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [workspaceId, fromRev, toRev]); // eslint-disable-line react-hooks/exhaustive-deps

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
                {files.map((f) => (
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

        {/* Keyed DiffEditor — remounts cleanly per file */}
        <div className="min-w-0 flex-1">
          {activePath ? (
            <DiffFileView
              key={activePath}
              workspaceId={workspaceId}
              fromRev={fromRev}
              toRev={toRev}
              path={activePath}
              language={language}
              theme={monacoThemeName}
              sideBySide={sideBySide}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="text-[11px] text-[var(--text-muted)]/60">No files to diff</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Per-file diff viewer (keyed, owns its own content loading) ──

function DiffFileView({
  workspaceId,
  fromRev,
  toRev,
  path,
  language,
  theme,
  sideBySide,
}: {
  workspaceId: string;
  fromRev: string;
  toRev: string;
  path: string;
  language: string;
  theme: string;
  sideBySide: boolean;
}) {
  const [left, setLeft] = useState<string | null>(null);
  const [right, setRight] = useState<string | null>(null);
  const modelRefs = useRef<{
    original: MonacoEditor.ITextModel | null;
    modified: MonacoEditor.ITextModel | null;
  }>({ original: null, modified: null });

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      window.sero.vcs.fileContent(workspaceId, fromRev, path).catch(() => ''),
      window.sero.vcs.fileContent(workspaceId, toRev, path).catch(() => ''),
    ]).then(([l, r]) => {
      if (!cancelled) { setLeft(l); setRight(r); }
    });
    return () => { cancelled = true; };
  }, [workspaceId, fromRev, toRev, path]);

  useEffect(() => {
    return () => {
      const { original, modified } = modelRefs.current;
      modelRefs.current = { original: null, modified: null };
      if (!original && !modified) return;

      // Defer model disposal until after DiffEditor has fully unmounted.
      setTimeout(() => {
        try { original?.dispose(); } catch {}
        try { modified?.dispose(); } catch {}
      }, 0);
    };
  }, []);

  const handleDiffMount = useCallback((editor: MonacoEditor.IStandaloneDiffEditor) => {
    const model = editor.getModel();
    modelRefs.current = {
      original: model?.original ?? null,
      modified: model?.modified ?? null,
    };
  }, []);

  if (left === null || right === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="size-4 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  return (
    <DiffEditor
      original={left}
      modified={right}
      language={language}
      theme={theme}
      onMount={handleDiffMount}
      keepCurrentOriginalModel
      keepCurrentModifiedModel
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
  );
}
