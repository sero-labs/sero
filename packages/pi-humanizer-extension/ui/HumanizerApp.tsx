/**
 * HumanizerApp — main Sero app component.
 *
 * Supports multiple writing styles (Humanizer, Sci-Fi, 70's Rock, etc.)
 * that can be combined. Modifiers layer additional constraints on top.
 *
 * Two layout modes driven by View Transitions API:
 *  - Input mode: full-width textarea filling the space
 *  - Result mode: side-by-side split — original left, transformed right
 *
 * Performance: during streaming, incoming deltas are buffered and
 * flushed to React state once per animation frame (~60 fps). Heavy
 * child subtrees (Header, Toolbar) are wrapped in React.memo so they
 * skip rerenders caused by output text changes.
 */

import { useState, useCallback, useMemo, useRef, memo } from 'react';
import { useAppState, useAI } from '@sero-ai/app-runtime';
import { cn } from '@sero-ai/ui/lib/utils';
import { ScrollArea } from '@sero-ai/ui/components/ui/scroll-area';
import { Streamdown } from 'streamdown';
import type { HumanizerState, HumanizeEntry, Style, Modifier } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { buildPrompt, getActionLabel, getPlaceholder } from './prompt-builder';
import { Header } from './components/Header';
import { Toolbar } from './components/Toolbar';
import { HistoryPanel } from './components/HistoryPanel';
import { PanelActions } from './components/PanelActions';
import { PaneHeader, PaneFooter } from './components/EditorPanes';
import { BUILT_IN_STYLES } from './lib/styles';
import { BUILT_IN_MODIFIERS } from './lib/presets';
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
  const [saved, setSaved] = useState(false);
  const [activeStyleIds, setActiveStyleIds] = useState<Set<string>>(new Set());
  const [activeModifierIds, setActiveModifierIds] = useState<Set<string>>(new Set());

  // ── rAF batching refs for streaming ──────────────────────

  const pendingDeltaRef = useRef('');
  const rafIdRef = useRef(0);

  // ── Derived data ─────────────────────────────────────────

  const allStyles = useMemo(
    () => [...BUILT_IN_STYLES, ...(state.customStyles ?? [])],
    [state.customStyles],
  );

  const allModifiers = useMemo(
    () => [...BUILT_IN_MODIFIERS, ...(state.customPresets ?? [])],
    [state.customPresets],
  );

  const activeStyles = useMemo(
    () => allStyles.filter((s) => activeStyleIds.has(s.id)),
    [allStyles, activeStyleIds],
  );

  const activeModifiers = useMemo(
    () => allModifiers.filter((m) => activeModifierIds.has(m.id)),
    [allModifiers, activeModifierIds],
  );

  const actionLabel = useMemo(() => getActionLabel(activeStyles), [activeStyles]);
  const placeholder = useMemo(() => getPlaceholder(activeStyles), [activeStyles]);
  const hasInput = useMemo(() => inputText.trim().length > 0, [inputText]);
  const hasOutput = outputText.length > 0;

  // ── Style management ─────────────────────────────────────

  const handleToggleStyle = useCallback((id: string) => {
    setActiveStyleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAddCustomStyle = useCallback(
    (style: Style) => {
      updateState((prev) => ({
        ...prev,
        customStyles: [...(prev.customStyles ?? []), style],
      }));
    },
    [updateState],
  );

  const handleRemoveCustomStyle = useCallback(
    (id: string) => {
      setActiveStyleIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      updateState((prev) => ({
        ...prev,
        customStyles: (prev.customStyles ?? []).filter((s) => s.id !== id),
      }));
    },
    [updateState],
  );

  // ── Modifier management ──────────────────────────────────

  const handleToggleModifier = useCallback((id: string) => {
    setActiveModifierIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleAddCustomModifier = useCallback(
    (modifier: Modifier) => {
      updateState((prev) => ({
        ...prev,
        customPresets: [...(prev.customPresets ?? []), modifier],
      }));
    },
    [updateState],
  );

  const handleRemoveCustomModifier = useCallback(
    (id: string) => {
      setActiveModifierIds((prev) => {
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

  // ── Transform ────────────────────────────────────────────

  const handleTransform = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;

    setLoading(true);
    setError(null);
    setOutputText('');
    setCopied(false);
    setSaved(false);
    pendingDeltaRef.current = '';

    let isFirstDelta = true;

    try {
      const prompt = buildPrompt({
        text,
        styles: activeStyles,
        modifiers: activeModifiers,
      });

      const response = await ai.promptStream(prompt, (delta) => {
        if (isFirstDelta) {
          isFirstDelta = false;
          // First delta triggers the view transition synchronously
          withViewTransition(() => {
            setOutputText(delta);
          });
          return;
        }

        // Buffer subsequent deltas — flush once per animation frame
        pendingDeltaRef.current += delta;
        if (!rafIdRef.current) {
          rafIdRef.current = requestAnimationFrame(() => {
            const buffered = pendingDeltaRef.current;
            pendingDeltaRef.current = '';
            rafIdRef.current = 0;
            setOutputText((prev) => prev + buffered);
          });
        }
      });

      // Flush any remaining buffer and set the authoritative final text
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = 0;
      }
      pendingDeltaRef.current = '';
      setOutputText(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transformation failed');
    } finally {
      setLoading(false);
    }
  }, [inputText, activeStyles, activeModifiers, ai]);

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

  const handleSave = useCallback(() => {
    if (!outputText || saved) return;
    const modifierText = activeModifiers.map((m) => m.prompt).join(' ');
    updateState((prev) => {
      const entry: HumanizeEntry = {
        id: prev.nextId,
        inputText: inputText.trim(),
        instructions: modifierText,
        outputText,
        createdAt: new Date().toISOString(),
        styleIds: activeStyles.map((s) => s.id),
      };
      return {
        ...prev,
        entries: [...prev.entries.slice(-19), entry],
        nextId: prev.nextId + 1,
      };
    });
    setSaved(true);
  }, [outputText, saved, inputText, activeStyles, activeModifiers, updateState]);

  const handleUseAsInput = useCallback(() => {
    withViewTransition(() => {
      setInputText(outputText);
      setOutputText('');
      setCopied(false);
      setSaved(false);
    });
  }, [outputText]);

  const handleClear = useCallback(() => {
    withViewTransition(() => {
      setInputText('');
      setOutputText('');
      setError(null);
      setCopied(false);
      setSaved(false);
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
    updateState((prev) => ({ ...prev, entries: [] }));
    withViewTransition(() => setView('editor'));
  }, [updateState]);

  // Stable callback — avoids creating a new function ref each render
  const handleShowHistory = useCallback(() => {
    withViewTransition(() => setView('history'));
  }, []);

  const handleShowEditor = useCallback(() => {
    withViewTransition(() => setView('editor'));
  }, []);

  // ── History view ─────────────────────────────────────────

  if (view === 'history') {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-background">
        <Header
          historyCount={state.entries.length}
          isHistory
          onToggleView={handleShowEditor}
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
        onToggleView={handleShowHistory}
      />

      <Toolbar
        allStyles={allStyles}
        allModifiers={allModifiers}
        activeStyleIds={activeStyleIds}
        activeModifierIds={activeModifierIds}
        onToggleStyle={handleToggleStyle}
        onAddCustomStyle={handleAddCustomStyle}
        onRemoveCustomStyle={handleRemoveCustomStyle}
        onToggleModifier={handleToggleModifier}
        onAddCustomModifier={handleAddCustomModifier}
        onRemoveCustomModifier={handleRemoveCustomModifier}
        hasInput={hasInput}
        loading={loading}
        actionLabel={actionLabel}
        onTransform={handleTransform}
        onClear={handleClear}
        error={error}
      />

      {/* Main content area */}
      <div className="flex min-h-0 flex-1">
        {hasOutput ? (
          <SplitView
            inputText={inputText}
            outputText={outputText}
            copied={copied}
            saved={saved}
            loading={loading}
            onInputChange={setInputText}
            onCopy={handleCopy}
            onSave={handleSave}
            onRefine={handleUseAsInput}
          />
        ) : (
          <FullWidthInput
            inputText={inputText}
            placeholder={placeholder}
            hasInput={hasInput}
            onInputChange={setInputText}
          />
        )}
      </div>
    </div>
  );
}

// ── Split view (original + transformed) ────────────────────

const SplitView = memo(function SplitView({
  inputText,
  outputText,
  copied,
  saved,
  loading,
  onInputChange,
  onCopy,
  onSave,
  onRefine,
}: {
  inputText: string;
  outputText: string;
  copied: boolean;
  saved: boolean;
  loading: boolean;
  onInputChange: (text: string) => void;
  onCopy: () => void;
  onSave: () => void;
  onRefine: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1">
      <InputPane text={inputText} onChange={onInputChange} />

      {/* Output pane — only this subtree needs to update on each delta */}
      <div className="vt-output-pane flex min-h-0 flex-1 flex-col humanizer-output-pane">
        <PaneHeader label="Transformed" variant="accent">
          <PanelActions copied={copied} saved={saved} onCopy={onCopy} onSave={onSave} onRefine={onRefine} />
        </PaneHeader>
        <ScrollArea className="min-h-0 flex-1">
          <div className="px-4 py-3 text-[13.5px] leading-[1.75] text-foreground selection:bg-emerald-500/20">
            <Streamdown
              mode={loading ? 'streaming' : 'static'}
              isAnimating={loading}
              animated={loading}
              caret={loading ? 'block' : undefined}
            >
              {outputText}
            </Streamdown>
          </div>
        </ScrollArea>
        {!loading && <PaneFooter text={outputText} />}
      </div>
    </div>
  );
});

// ── Input pane (stable during streaming) ───────────────────

const InputPane = memo(function InputPane({
  text,
  onChange,
}: {
  text: string;
  onChange: (text: string) => void;
}) {
  return (
    <div className="vt-input-pane flex min-h-0 flex-1 flex-col border-r border-border/30">
      <PaneHeader label="Original" variant="muted" />
      <ScrollArea className="min-h-0 flex-1">
        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          className={cn(
            'humanizer-textarea field-sizing-content',
            'w-full min-h-[120px] resize-none bg-transparent',
            'px-4 py-3',
            'text-[13.5px] leading-[1.75] text-foreground/60',
          )}
        />
      </ScrollArea>
      <PaneFooter text={text} />
    </div>
  );
});

// ── Full-width input ───────────────────────────────────────

const FullWidthInput = memo(function FullWidthInput({
  inputText,
  placeholder,
  hasInput,
  onInputChange,
}: {
  inputText: string;
  placeholder: string;
  hasInput: boolean;
  onInputChange: (text: string) => void;
}) {
  return (
    <div className="vt-input-pane flex min-h-0 flex-1 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <textarea
          value={inputText}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={placeholder}
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
  );
});

export default HumanizerApp;
