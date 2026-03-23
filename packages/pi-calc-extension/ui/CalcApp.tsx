/**
 * CalcApp — Premium dark calculator UI for Sero.
 *
 * Tailwind CSS + @sero/ui utilities for styling.
 * useAppState from @sero-ai/app-runtime syncs with Pi extension via state.json.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import { cn } from '@sero/ui/lib/utils';
import type { CalcState, HistoryEntry } from '../shared/types';
import { DEFAULT_CALC_STATE } from '../shared/types';
import { evaluate, formatDisplay, getDisplaySizeClass } from './calc-engine';
import './styles.css';

// ── CalcApp ──────────────────────────────────────────────────

export function CalcApp() {
  const [state, updateState] = useAppState<CalcState>(DEFAULT_CALC_STATE);
  const [currentValue, setCurrentValue] = useState('0');
  const [expression, setExpression] = useState('');
  const [shouldResetNext, setShouldResetNext] = useState(false);
  const [activeOp, setActiveOp] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync display from external state changes (agent-side updates)
  useEffect(() => {
    if (state.display && state.display !== '0') {
      setCurrentValue(state.display);
    }
    if (state.expression) {
      setExpression(state.expression);
    }
  }, [state.display, state.expression]);

  const handleNumber = useCallback((num: string) => {
    setActiveOp(null);
    if (shouldResetNext) {
      setCurrentValue(num);
      setShouldResetNext(false);
      return;
    }
    setCurrentValue((prev) => {
      if (prev === '0' && num !== '.') return num;
      if (num === '.' && prev.includes('.')) return prev;
      return prev + num;
    });
  }, [shouldResetNext]);

  const handleOperator = useCallback((op: string) => {
    setActiveOp(op);
    setShouldResetNext(true);
    setExpression((prev) => {
      const val = currentValue;
      if (prev === '') return `${val} ${op} `;
      if (shouldResetNext) {
        return prev.replace(/[+\-×÷]\s*$/, `${op} `);
      }
      return `${prev}${val} ${op} `;
    });
  }, [currentValue, shouldResetNext]);

  const handleEquals = useCallback(() => {
    setActiveOp(null);
    const fullExpr = shouldResetNext
      ? expression.trim()
      : `${expression}${currentValue}`;
    if (!fullExpr) return;
    try {
      const result = evaluate(fullExpr);
      const entry: HistoryEntry = {
        id: state.nextId,
        expression: fullExpr,
        result,
        createdAt: new Date().toISOString(),
      };
      updateState((prev) => ({
        ...prev,
        display: result,
        expression: fullExpr,
        history: [entry, ...prev.history].slice(0, 50),
        nextId: prev.nextId + 1,
      }));
      setCurrentValue(result);
      setExpression('');
      setShouldResetNext(true);
    } catch {
      setCurrentValue('Error');
      setExpression('');
      setShouldResetNext(true);
    }
  }, [expression, currentValue, shouldResetNext, state.nextId, updateState]);

  const handleClear = useCallback(() => {
    setCurrentValue('0');
    setExpression('');
    setShouldResetNext(false);
    setActiveOp(null);
  }, []);

  const handleToggleSign = useCallback(() => {
    setCurrentValue((prev) => {
      if (prev === '0' || prev === 'Error') return prev;
      return prev.startsWith('-') ? prev.slice(1) : `-${prev}`;
    });
  }, []);

  const handlePercent = useCallback(() => {
    setCurrentValue((prev) => {
      const num = parseFloat(prev);
      if (isNaN(num)) return prev;
      return String(num / 100);
    });
  }, []);

  const handleBackspace = useCallback(() => {
    setCurrentValue((prev) => {
      if (prev.length <= 1 || prev === 'Error') return '0';
      return prev.slice(0, -1);
    });
  }, []);

  const handleHistorySelect = useCallback((entry: HistoryEntry) => {
    setCurrentValue(entry.result);
    setExpression('');
    setShouldResetNext(true);
    setShowHistory(false);
  }, []);

  const handleClearHistory = useCallback(() => {
    updateState((prev) => ({ ...prev, history: [] }));
  }, [updateState]);

  // Keyboard support (scoped to container, not window)
  useEffect(() => {
    const target = containerRef.current;
    if (!target) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handleNumber(e.key);
      else if (e.key === '.') handleNumber('.');
      else if (e.key === '+') handleOperator('+');
      else if (e.key === '-') handleOperator('-');
      else if (e.key === '*') handleOperator('×');
      else if (e.key === '/') { e.preventDefault(); handleOperator('÷'); }
      else if (e.key === 'Enter' || e.key === '=') handleEquals();
      else if (e.key === 'Escape') handleClear();
      else if (e.key === 'Backspace') handleBackspace();
      else if (e.key === '%') handlePercent();
    };
    target.addEventListener('keydown', onKeyDown);
    return () => target.removeEventListener('keydown', onKeyDown);
  }, [handleNumber, handleOperator, handleEquals, handleClear, handleBackspace, handlePercent]);

  // Auto-focus container on mount
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  const displayValue = formatDisplay(currentValue);
  const sizeClass = getDisplaySizeClass(displayValue);

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      className="flex h-full w-full flex-col overflow-hidden bg-background text-foreground outline-none"
    >
      <div className="mx-auto flex w-full max-w-[600px] flex-1 flex-col justify-center gap-3 p-4">

        {/* Display */}
        <div className="shrink-0 rounded-2xl bg-white/[0.05] px-6 py-5">
          <div className="min-h-5 text-right text-sm tracking-wide text-muted-foreground/50">
            {expression || '\u00A0'}
          </div>
          <div
            className={cn(
              'text-right font-light leading-tight tracking-tight text-foreground transition-[font-size] duration-150',
              sizeClass === 'very-long' && 'text-2xl',
              sizeClass === 'long' && 'text-[34px]',
              !sizeClass && 'text-5xl',
            )}
          >
            {displayValue}
          </div>
        </div>

        {/* History toggle */}
        {state.history.length > 0 && (
          <div className="flex shrink-0 justify-center">
            <button
              className="flex cursor-default items-center gap-1.5 rounded-lg px-3 py-1 text-xs text-muted-foreground/40 transition-colors hover:bg-white/[0.05] hover:text-muted-foreground/70"
              onClick={() => setShowHistory((v) => !v)}
            >
              <HistoryIcon />
              {showHistory ? 'Hide' : `History (${state.history.length})`}
            </button>
          </div>
        )}

        {/* History panel — always mounted, animated height via grid-rows */}
        {state.history.length > 0 && (
          <div
            className={cn(
              'grid shrink-0 transition-[grid-template-rows,opacity] duration-300 ease-out',
              showHistory ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
            )}
          >
            <div className="overflow-hidden">
              <HistoryPanel
                history={state.history}
                onSelect={handleHistorySelect}
                onClear={handleClearHistory}
              />
            </div>
          </div>
        )}

        {/* Button grid */}
        <div className="grid shrink-0 grid-cols-4 gap-2.5">
          <CalcBtn label="C" type="fn" onClick={handleClear} />
          <CalcBtn label="±" type="fn" onClick={handleToggleSign} />
          <CalcBtn label="%" type="fn" onClick={handlePercent} />
          <CalcBtn label="÷" type="op" active={activeOp === '÷'} onClick={() => handleOperator('÷')} />

          <CalcBtn label="7" onClick={() => handleNumber('7')} />
          <CalcBtn label="8" onClick={() => handleNumber('8')} />
          <CalcBtn label="9" onClick={() => handleNumber('9')} />
          <CalcBtn label="×" type="op" active={activeOp === '×'} onClick={() => handleOperator('×')} />

          <CalcBtn label="4" onClick={() => handleNumber('4')} />
          <CalcBtn label="5" onClick={() => handleNumber('5')} />
          <CalcBtn label="6" onClick={() => handleNumber('6')} />
          <CalcBtn label="-" type="op" active={activeOp === '-'} onClick={() => handleOperator('-')} />

          <CalcBtn label="1" onClick={() => handleNumber('1')} />
          <CalcBtn label="2" onClick={() => handleNumber('2')} />
          <CalcBtn label="3" onClick={() => handleNumber('3')} />
          <CalcBtn label="+" type="op" active={activeOp === '+'} onClick={() => handleOperator('+')} />

          <CalcBtn label="0" wide onClick={() => handleNumber('0')} />
          <CalcBtn label="." onClick={() => handleNumber('.')} />
          <CalcBtn label="=" type="eq" onClick={handleEquals} />
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function CalcBtn({
  label,
  type = 'num',
  wide = false,
  active = false,
  onClick,
}: {
  label: string;
  type?: 'num' | 'op' | 'fn' | 'eq';
  wide?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        'flex h-[68px] cursor-default select-none items-center justify-center rounded-2xl text-lg font-medium outline-none transition-[background-color,box-shadow,transform] duration-200 ease-out active:scale-[0.96] active:duration-75',
        type === 'num' && 'bg-white/[0.07] text-foreground hover:bg-white/[0.13] hover:shadow-[0_0_16px_rgba(255,255,255,0.04)]',
        type === 'fn' && 'bg-white/[0.12] text-foreground/70 hover:bg-white/[0.20] hover:text-foreground/90',
        type === 'op' && [
          'bg-amber-500 text-xl text-white hover:bg-amber-400 hover:shadow-[0_0_20px_rgba(245,158,11,0.2)]',
          active && 'bg-amber-400 shadow-[0_0_24px_rgba(245,158,11,0.3)]',
        ],
        type === 'eq' && 'bg-sky-600 text-xl text-white hover:bg-sky-500 hover:shadow-[0_0_20px_rgba(14,165,233,0.2)]',
        wide && 'col-span-2',
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function HistoryPanel({
  history,
  onSelect,
  onClear,
}: {
  history: HistoryEntry[];
  onSelect: (entry: HistoryEntry) => void;
  onClear: () => void;
}) {
  return (
    <div className="shrink-0 overflow-hidden rounded-2xl bg-white/[0.05]">
      <div className="flex items-center justify-between px-5 py-2.5">
        <span className="text-[11px] uppercase tracking-widest text-muted-foreground/40">
          Recent
        </span>
        <button
          className="cursor-default text-[11px] text-muted-foreground/40 transition-colors hover:text-red-400"
          onClick={onClear}
        >
          Clear
        </button>
      </div>
      <div className="max-h-[180px] overflow-y-auto">
        {history.slice(0, 10).map((entry) => (
          <button
            key={entry.id}
            className="w-full cursor-default border-t border-white/[0.05] px-5 py-2.5 text-right transition-[background-color,transform] duration-200 ease-out hover:bg-white/[0.06]"
            onClick={() => onSelect(entry)}
          >
            <div className="text-xs text-muted-foreground/40">{entry.expression}</div>
            <div className="text-sm font-light text-foreground/80">= {entry.result}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function HistoryIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export default CalcApp;
