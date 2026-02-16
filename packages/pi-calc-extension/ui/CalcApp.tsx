/**
 * CalcApp — Modern calculator UI for Sero.
 *
 * Styled like iOS/Android calculator apps with a dark theme,
 * orange operator keys, and smooth interactions.
 *
 * Uses useAppState from @sero/app-runtime to sync with the
 * Pi extension via shared state.json file.
 */

import { useState, useCallback, useEffect } from 'react';
import { useAppState } from '@sero/app-runtime';
import type { CalcState, HistoryEntry } from '../shared/types';
import { DEFAULT_CALC_STATE } from '../shared/types';
import { CALC_STYLES } from './styles';
import { isOperator, evaluate, formatDisplay, getDisplaySizeClass, toMathExpr } from './calc-engine';

// ── CalcApp ──────────────────────────────────────────────────

export function CalcApp() {
  const [state, updateState] = useAppState<CalcState>(DEFAULT_CALC_STATE);
  const [currentValue, setCurrentValue] = useState('0');
  const [expression, setExpression] = useState('');
  const [shouldResetNext, setShouldResetNext] = useState(false);
  const [activeOp, setActiveOp] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

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
        // Replace last operator
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

  // Keyboard support
  useEffect(() => {
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
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleNumber, handleOperator, handleEquals, handleClear, handleBackspace, handlePercent]);

  const displayValue = formatDisplay(currentValue);
  const sizeClass = getDisplaySizeClass(displayValue);

  return (
    <>
      <style>{CALC_STYLES}</style>
      <div className="calc-root flex h-full w-full flex-col overflow-hidden">
        <div className="mx-auto flex w-full max-w-[380px] flex-1 flex-col p-4">

          {/* Display */}
          <div className="calc-display mb-3 shrink-0">
            <div className="calc-expression">
              {expression || '\u00A0'}
            </div>
            <div className={`calc-result ${sizeClass}`}>
              {displayValue}
            </div>
          </div>

          {/* History toggle */}
          {state.history.length > 0 && (
            <div className="mb-2 flex justify-center shrink-0">
              <button
                className="calc-history-toggle"
                onClick={() => setShowHistory((v) => !v)}
              >
                <HistoryIcon />
                {showHistory ? 'Hide history' : `History (${state.history.length})`}
              </button>
            </div>
          )}

          {/* History panel (expandable) */}
          {showHistory && state.history.length > 0 && (
            <HistoryPanel
              history={state.history}
              onSelect={handleHistorySelect}
              onClear={handleClearHistory}
            />
          )}

          {/* Button grid */}
          <div className="calc-grid mt-auto shrink-0">
            <CalcButton label="C" type="fn" onClick={handleClear} />
            <CalcButton label="+/−" type="fn" onClick={handleToggleSign} />
            <CalcButton label="%" type="fn" onClick={handlePercent} />
            <CalcButton label="÷" type="op" active={activeOp === '÷'} onClick={() => handleOperator('÷')} />

            <CalcButton label="7" onClick={() => handleNumber('7')} />
            <CalcButton label="8" onClick={() => handleNumber('8')} />
            <CalcButton label="9" onClick={() => handleNumber('9')} />
            <CalcButton label="×" type="op" active={activeOp === '×'} onClick={() => handleOperator('×')} />

            <CalcButton label="4" onClick={() => handleNumber('4')} />
            <CalcButton label="5" onClick={() => handleNumber('5')} />
            <CalcButton label="6" onClick={() => handleNumber('6')} />
            <CalcButton label="-" type="op" active={activeOp === '-'} onClick={() => handleOperator('-')} />

            <CalcButton label="1" onClick={() => handleNumber('1')} />
            <CalcButton label="2" onClick={() => handleNumber('2')} />
            <CalcButton label="3" onClick={() => handleNumber('3')} />
            <CalcButton label="+" type="op" active={activeOp === '+'} onClick={() => handleOperator('+')} />

            <CalcButton label="0" type="num" wide onClick={() => handleNumber('0')} />
            <CalcButton label="." onClick={() => handleNumber('.')} />
            <CalcButton label="=" type="eq" onClick={handleEquals} />
          </div>
        </div>
      </div>
    </>
  );
}

// ── Sub-components ───────────────────────────────────────────

function CalcButton({
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
  const cls = [
    'calc-btn',
    type === 'op' ? 'calc-btn-op' : type === 'fn' ? 'calc-btn-fn' : type === 'eq' ? 'calc-btn-eq' : 'calc-btn-num',
    wide ? 'calc-btn-zero' : '',
    active ? 'active' : '',
  ].filter(Boolean).join(' ');

  return (
    <button className={cls} onClick={onClick}>
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
    <div className="calc-history-panel mb-3 calc-animate-in shrink-0 max-h-[200px] flex flex-col">
      <div className="calc-history-header">
        <span style={{ fontSize: 12, color: 'var(--calc-muted)' }}>
          Recent calculations
        </span>
        <button className="calc-history-clear" onClick={onClear}>
          Clear all
        </button>
      </div>
      <div className="overflow-y-auto flex-1">
        {history.slice(0, 10).map((entry) => (
          <div
            key={entry.id}
            className="calc-history-item"
            onClick={() => onSelect(entry)}
          >
            <div className="calc-history-expr">{entry.expression}</div>
            <div className="calc-history-result">= {entry.result}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HistoryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

export default CalcApp;
