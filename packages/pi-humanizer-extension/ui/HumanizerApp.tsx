/**
 * HumanizerApp — main Sero app component.
 *
 * Provides a text input area, optional instructions field, and a
 * humanize button that calls the LLM via useAI() to remove AI
 * writing patterns from the provided text.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAppState, useAI } from '@sero/app-runtime';
import { cn } from '@sero/ui/lib/utils';
import { Button } from '@sero/ui/components/ui/button';
import type { HumanizerState, HumanizeEntry } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { buildHumanizePrompt } from './humanize-prompt';
import './styles.css';

export function HumanizerApp() {
  const [state, updateState] = useAppState<HumanizerState>(DEFAULT_STATE);
  const ai = useAI();

  const [inputText, setInputText] = useState('');
  const [instructions, setInstructions] = useState('');
  const [outputText, setOutputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const outputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textareas
  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => autoResize(inputRef.current), [inputText, autoResize]);
  useEffect(() => autoResize(outputRef.current), [outputText, autoResize]);

  // ── Humanize ─────────────────────────────────────────────

  const handleHumanize = useCallback(async () => {
    const text = inputText.trim();
    if (!text) return;

    setLoading(true);
    setError(null);
    setOutputText('');
    setCopied(false);

    try {
      const prompt = buildHumanizePrompt(text, instructions.trim() || undefined);
      const response = await ai.prompt(prompt);
      setOutputText(response);

      // Save to history
      updateState((prev) => {
        const entry: HumanizeEntry = {
          id: prev.nextId,
          inputText: text,
          instructions: instructions.trim(),
          outputText: response,
          createdAt: new Date().toISOString(),
        };
        return {
          entries: [...prev.entries.slice(-19), entry],
          nextId: prev.nextId + 1,
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Humanization failed');
    } finally {
      setLoading(false);
    }
  }, [inputText, instructions, ai, updateState]);

  // ── Copy output ──────────────────────────────────────────

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

  // ── Clear ────────────────────────────────────────────────

  const handleClear = useCallback(() => {
    setInputText('');
    setInstructions('');
    setOutputText('');
    setError(null);
    setCopied(false);
  }, []);

  // ── Load from history ────────────────────────────────────

  const handleLoadEntry = useCallback((entry: HumanizeEntry) => {
    setInputText(entry.inputText);
    setInstructions(entry.instructions);
    setOutputText(entry.outputText);
    setShowHistory(false);
  }, []);

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h1 className="text-base font-semibold text-foreground">Humanizer</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Remove AI writing patterns from your text
          </p>
        </div>
        {state.entries.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => setShowHistory(!showHistory)}
          >
            {showHistory ? 'Back' : `History (${state.entries.length})`}
          </Button>
        )}
      </div>

      {/* History panel */}
      {showHistory ? (
        <HistoryPanel entries={state.entries} onLoad={handleLoadEntry} />
      ) : (
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-5">
            {/* Input area */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Text to humanize
              </label>
              <textarea
                ref={inputRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Paste your AI-generated text or markdown here..."
                className={cn(
                  'min-h-[160px] w-full resize-none rounded-lg border border-input',
                  'bg-card px-3.5 py-2.5 text-sm leading-relaxed text-foreground',
                  'placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-1 focus:ring-ring',
                )}
              />
            </div>

            {/* Instructions */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Instructions{' '}
                <span className="font-normal text-muted-foreground/60">
                  (optional)
                </span>
              </label>
              <input
                type="text"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Keep a formal tone, preserve technical terms..."
                className={cn(
                  'w-full rounded-lg border border-input bg-card px-3.5 py-2',
                  'text-sm text-foreground placeholder:text-muted-foreground',
                  'focus:outline-none focus:ring-1 focus:ring-ring',
                )}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={!inputText.trim() || loading}
                onClick={handleHumanize}
              >
                {loading ? 'Humanizing...' : 'Humanize'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={handleClear}
                disabled={loading}
              >
                Clear
              </Button>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Loading indicator */}
            {loading && (
              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                <LoadingDots />
                <span>Analyzing and rewriting your text...</span>
              </div>
            )}

            {/* Output */}
            {outputText && (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">
                    Humanized output
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-muted-foreground"
                    onClick={handleCopy}
                  >
                    {copied ? 'Copied!' : 'Copy'}
                  </Button>
                </div>
                <textarea
                  ref={outputRef}
                  value={outputText}
                  readOnly
                  className={cn(
                    'min-h-[160px] w-full resize-none rounded-lg border border-input',
                    'bg-secondary/30 px-3.5 py-2.5 text-sm leading-relaxed text-foreground',
                    'focus:outline-none focus:ring-1 focus:ring-ring',
                  )}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Loading dots animation ─────────────────────────────────

function LoadingDots() {
  return (
    <span className="inline-flex gap-0.5">
      <span className="humanizer-dot h-1.5 w-1.5 rounded-full bg-muted-foreground" />
      <span className="humanizer-dot h-1.5 w-1.5 rounded-full bg-muted-foreground [animation-delay:150ms]" />
      <span className="humanizer-dot h-1.5 w-1.5 rounded-full bg-muted-foreground [animation-delay:300ms]" />
    </span>
  );
}

// ── History panel ──────────────────────────────────────────

function HistoryPanel({
  entries,
  onLoad,
}: {
  entries: HumanizeEntry[];
  onLoad: (entry: HumanizeEntry) => void;
}) {
  const sorted = [...entries].reverse();

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-2 p-5">
        {sorted.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={cn(
              'flex flex-col gap-1 rounded-lg border border-border bg-card px-4 py-3',
              'text-left transition-colors hover:bg-secondary/50',
            )}
            onClick={() => onLoad(entry)}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {new Date(entry.createdAt).toLocaleString()}
              </span>
              {entry.instructions && (
                <span className="max-w-[200px] truncate text-xs text-muted-foreground/60">
                  {entry.instructions}
                </span>
              )}
            </div>
            <p className="line-clamp-2 text-sm text-foreground">
              {entry.inputText}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}


