/**
 * HumanizerApp — main Sero app component.
 *
 * Two layout modes driven by View Transitions API:
 *  - Input mode: full-width textarea filling the space
 *  - Result mode: side-by-side split — original left, humanized right
 *
 * The transition between modes is animated via named view-transition
 * elements so the input pane smoothly shrinks while output slides in.
 */

import { useState, useCallback, useMemo } from 'react';
import { useAppState, useAI } from '@sero/app-runtime';
import { cn } from '@sero/ui/lib/utils';
import { Button } from '@sero/ui/components/ui/button';
import { ScrollArea } from '@sero/ui/components/ui/scroll-area';
import type { HumanizerState, HumanizeEntry, InstructionPreset } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { buildHumanizePrompt } from './humanize-prompt';
import { InstructionPresets } from './components/InstructionPresets';
import { HistoryPanel } from './components/HistoryPanel';
import { StatsRow } from './components/StatsRow';
import { PanelActions } from './components/PanelActions';
import { BUILT_IN_PRESETS } from './lib/presets';
import { withViewTransition } from './lib/view-transition';
import './styles.css';

type View = 'editor' | 'history';

export function HumanizerApp() {
  const [state, updateState] = useAppState<HumanizerState>(DEFAULT_STATE);
  const ai = useAI();

  const [view, setView] = useState<View>('editor');
  const [inputText, setInputText] = useState('');
  const [outputText, setOutputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [activePresetIds, setActivePresetIds] = useState<Set<string>>(new Set());

  const allPresets = useMemo(
    () => [...BUILT_IN_PRESETS, ...(state.customPresets ?? [])],
    [state.customPresets],
  );

  const combinedInstructions = useMemo(() => {
    if (activePresetIds.size === 0) return '';
    return allPresets
      .filter((p) => activePresetIds.has(p.id))
      .map((p) => p.prompt)
      .join(' ');
  }, [activePresetIds, allPresets]);

  // ── Preset management ────────────────────────────────────

  const handleTogglePreset = useCallback((id: string) => {
    setActivePresetIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAddCustomPreset = useCallback(
    (preset: InstructionPreset) => {
      updateState((prev) => ({
        ...prev,
        customPresets: [...(prev.customPresets ?? []), preset],
      }));
    },
    [updateState],
  );

  const handleRemoveCustomPreset = useCallback(
    (id: string) => {
      setActivePresetIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      updateState((prev) => ({
        ...prev,
        customPresets: (prev.customPresets ?? []).filter((p) => p.id !== id),
      }));
    },
    [updateState],
  );

  // ── Humanize ─────────────────────────────────────────────

  const handleHumanize = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;

    setLoading(true);
    setError(null);
    setOutputText('');
    setCopied(false);

    try {
      const prompt = buildHumanizePrompt(text, combinedInstructions || undefined);
      const response = await ai.prompt(prompt);

      // Animate the layout shift with View Transitions
      withViewTransition(() => {
        setOutputText(response);
      });

      updateState((prev) => {
        const entry: HumanizeEntry = {
          id: prev.nextId,
          inputText: text,
          instructions: combinedInstructions,
          outputText: response,
          createdAt: new Date().toISOString(),
        };
        return {
          ...prev,
          entries: [...prev.entries.slice(-19), entry],
          nextId: prev.nextId + 1,
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Humanization failed');
    } finally {
      setLoading(false);
    }
  }, [inputText, combinedInstructions, ai, updateState]);

  // ── Actions ──────────────────────────────────────────────

  const handleCopy = useCallback(async () => {
    if (!outputText) return;
    try {
      await navigator.clipboard.writeText(outputText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  }, [outputText]);

  const handleUseAsInput = useCallback(() => {
    withViewTransition(() => {
      setInputText(outputText);
      setOutputText('');
      setCopied(false);
    });
  }, [outputText]);

  const handleClear = useCallback(() => {
    withViewTransition(() => {
      setInputText('');
      setOutputText('');
      setError(null);
      setCopied(false);
    });
  }, []);

  const handleLoadEntry = useCallback((entry: HumanizeEntry) => {
    withViewTransition(() => {
      setInputText(entry.inputText);
      setOutputText(entry.outputText);
      setView('editor');
    });
  }, []);

  const handleClearHistory = useCallback(() => {
    updateState((prev) => ({
      ...prev,
      entries: [],
    }));
    withViewTransition(() => setView('editor'));
  }, [updateState]);

  const hasInput = inputText.trim().length > 0;
  const hasOutput = !!outputText;

  // ── History view ─────────────────────────────────────────

  if (view === 'history') {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-background">
        <Header
          historyCount={state.entries.length}
          isHistory
          onToggleView={() => withViewTransition(() => setView('editor'))}
        />
        <HistoryPanel
          entries={state.entries}
          onLoad={handleLoadEntry}
          onClearHistory={handleClearHistory}
        />
      </div>
    );
  }

  // ── Editor view ──────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <Header
        historyCount={state.entries.length}
        isHistory={false}
        onToggleView={() => withViewTransition(() => setView('history'))}
      />

      {/* Toolbar: presets + action button */}
      <Toolbar
        activePresetIds={activePresetIds}
        allPresets={allPresets}
        onTogglePreset={handleTogglePreset}
        onAddCustom={handleAddCustomPreset}
        onRemoveCustom={handleRemoveCustomPreset}
        hasInput={hasInput}
        loading={loading}
        onHumanize={handleHumanize}
        onClear={handleClear}
        error={error}
      />

      {/* Main content area */}
      <div className="flex min-h-0 flex-1">
        {hasOutput ? (
          /* ── Side-by-side split ────────────────────────── */
          <div className="flex min-h-0 flex-1">
            {/* Input pane */}
            <div
              className="vt-input-pane flex min-h-0 flex-1 flex-col border-r border-border/30"
            >
              <PaneHeader label="Original" variant="muted" />
              <ScrollArea className="min-h-0 flex-1">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className={cn(
                    'humanizer-textarea field-sizing-content',
                    'w-full min-h-[120px] resize-none bg-transparent',
                    'px-4 py-3',
                    'text-[13.5px] leading-[1.75] text-foreground/60',
                  )}
                />
              </ScrollArea>
              <PaneFooter text={inputText} />
            </div>

            {/* Output pane */}
            <div
              className="vt-output-pane flex min-h-0 flex-1 flex-col humanizer-output-pane"
            >
              <PaneHeader label="Humanized" variant="accent">
                <PanelActions
                  copied={copied}
                  onCopy={handleCopy}
                  onRefine={handleUseAsInput}
                />
              </PaneHeader>
              <ScrollArea className="min-h-0 flex-1">
                <div
                  className={cn(
                    'whitespace-pre-wrap px-4 py-3',
                    'text-[13.5px] leading-[1.75] text-foreground',
                    'selection:bg-emerald-500/20',
                  )}
                >
                  {outputText}
                </div>
              </ScrollArea>
              <PaneFooter text={outputText} />
            </div>
          </div>
        ) : (
          /* ── Full-width input ──────────────────────────── */
          <div
            className="vt-input-pane flex min-h-0 flex-1 flex-col"
          >
            <ScrollArea className="min-h-0 flex-1">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste your AI-generated text here…"
                className={cn(
                  'humanizer-textarea field-sizing-content',
                  'w-full min-h-[200px] resize-none bg-transparent',
                  'px-5 py-4',
                  'text-[13.5px] leading-[1.75] text-foreground',
                  'placeholder:text-muted-foreground/30',
                )}
              />
            </ScrollArea>
            {hasInput && <PaneFooter text={inputText} />}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Header ─────────────────────────────────────────────────

function Header({
  historyCount,
  isHistory,
  onToggleView,
}: {
  historyCount: number;
  isHistory: boolean;
  onToggleView: () => void;
}) {
  return (
    <div className="vt-header flex items-center justify-between border-b border-border/50 px-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400">
            <path d="M12 20h9" /><path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z" />
          </svg>
        </div>
        <h1 className="text-sm font-semibold text-foreground">Humanizer</h1>
      </div>
      {historyCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'h-7 rounded-lg px-2.5 text-xs',
            isHistory
              ? 'text-foreground'
              : 'text-muted-foreground/60 hover:text-foreground',
          )}
          onClick={onToggleView}
        >
          {isHistory ? '← Back' : `History · ${historyCount}`}
        </Button>
      )}
    </div>
  );
}

// ── Toolbar ────────────────────────────────────────────────

function Toolbar({
  activePresetIds,
  allPresets,
  onTogglePreset,
  onAddCustom,
  onRemoveCustom,
  hasInput,
  loading,
  onHumanize,
  onClear,
  error,
}: {
  activePresetIds: Set<string>;
  allPresets: InstructionPreset[];
  onTogglePreset: (id: string) => void;
  onAddCustom: (preset: InstructionPreset) => void;
  onRemoveCustom: (id: string) => void;
  hasInput: boolean;
  loading: boolean;
  onHumanize: () => void;
  onClear: () => void;
  error: string | null;
}) {
  return (
    <div className="vt-toolbar flex flex-col gap-2.5 border-b border-border/40 px-4 py-3">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <InstructionPresets
            activeIds={activePresetIds}
            allPresets={allPresets}
            onToggle={onTogglePreset}
            onAddCustom={onAddCustom}
            onRemoveCustom={onRemoveCustom}
          />
        </div>

        <div className="flex shrink-0 items-center gap-3 pt-0.5">
          {hasInput && !loading && (
            <button
              type="button"
              onClick={onClear}
              className="rounded-md px-2 py-1 text-[11px] text-muted-foreground/50 transition-colors hover:bg-secondary hover:text-muted-foreground"
            >
              Clear
            </button>
          )}
          <Button
            size="sm"
            disabled={!hasInput || loading}
            onClick={onHumanize}
            className={cn(
              'humanizer-button',
              'h-8 rounded-lg px-5 text-xs font-medium',
              'bg-emerald-600 text-white hover:bg-emerald-500',
              'transition-all duration-200',
              !loading && hasInput && 'shadow-[0_0_20px_rgba(16,185,129,0.3)]',
            )}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <LoadingSpinner />
                Working…
              </span>
            ) : (
              'Humanize'
            )}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}

// ── Pane header / footer ───────────────────────────────────

function PaneHeader({
  label,
  variant,
  children,
}: {
  label: string;
  variant: 'muted' | 'accent';
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/30 px-4 py-1.5">
      <span
        className={cn(
          'text-[11px] font-semibold tracking-wider uppercase',
          variant === 'accent' ? 'text-emerald-400' : 'text-muted-foreground/40',
        )}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function PaneFooter({ text }: { text: string }) {
  return (
    <div className="border-t border-border/30 px-4 py-1.5">
      <StatsRow text={text} />
    </div>
  );
}

function LoadingSpinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" className="opacity-20" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default HumanizerApp;
