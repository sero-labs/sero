/**
 * SliderRow, labelled slider with a live px value display and text input.
 * Used for spacing and radius controls in the theme editor.
 */

import { useCallback } from 'react';
import { Slider } from '@sero-ai/ui/components/ui/slider';

interface SliderRowProps {
  label: string;
  /** Current value as a CSS px string, e.g. "8px". */
  value: string;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: string) => void;
}

/** Parse "12px" → 12. Falls back to 0 on garbage. */
function parsePx(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export function SliderRow({
  label,
  value,
  min = 0,
  max = 48,
  step = 1,
  onChange,
}: SliderRowProps) {
  const numValue = parsePx(value);

  const handleSlider = useCallback(
    (vals: number[]) => {
      onChange(`${vals[0]}px`);
    },
    [onChange],
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const n = parseFloat(e.target.value);
      if (Number.isFinite(n) && n >= min && n <= max) {
        onChange(`${n}px`);
      }
    },
    [onChange, min, max],
  );

  return (
    <div className="flex items-center gap-3">
      <span className="w-12 shrink-0 text-xs text-[var(--text-secondary)]">
        {label}
      </span>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[numValue]}
        onValueChange={handleSlider}
        className="flex-1"
      />
      <input aria-label="Number input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={numValue}
        onChange={handleInput}
        className="w-14 shrink-0 rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 py-0.5 text-center text-xs tabular-nums text-[var(--text-primary)] font-mono"
      />
    </div>
  );
}
