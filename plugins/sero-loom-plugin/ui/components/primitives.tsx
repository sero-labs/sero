import type { ReactNode } from 'react';
import { isExpr, type Scalar } from '../../shared/graph';

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b border-border pb-3">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 truncate text-muted-foreground">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
      />
      <span className="w-10 shrink-0 text-right font-mono tabular-nums text-muted-foreground">
        {Number.isInteger(step) ? value.toFixed(0) : value.toFixed(2)}
      </span>
    </label>
  );
}

// A value that can be a constant (slider) or an expression (text). The ƒx / #
// button toggles between the two so the agent's expressions stay editable here.
export function ScalarRow({
  label,
  value,
  min,
  max,
  step = 0.01,
  onChange,
}: {
  label: string;
  value: Scalar;
  min: number;
  max: number;
  step?: number;
  onChange: (v: Scalar) => void;
}) {
  if (isExpr(value)) {
    return (
      <label className="flex items-center gap-2 text-xs">
        <span className="w-20 shrink-0 truncate text-muted-foreground">{label}</span>
        <input
          type="text"
          value={value.expr}
          onChange={(e) => onChange({ expr: e.target.value })}
          spellCheck={false}
          className="h-7 min-w-0 flex-1 rounded-md border border-primary/40 bg-background px-2 font-mono text-[11px] text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          onClick={() => onChange(min)}
          title="Use a constant"
          className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
        >
          #
        </button>
      </label>
    );
  }
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-20 shrink-0 truncate text-muted-foreground">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
      />
      <span className="w-9 shrink-0 text-right font-mono tabular-nums text-muted-foreground">
        {Number.isInteger(step) ? value.toFixed(0) : value.toFixed(2)}
      </span>
      <button
        type="button"
        onClick={() => onChange({ expr: String(value) })}
        title="Drive with an expression"
        className="shrink-0 rounded bg-secondary px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
      >
        ƒx
      </button>
    </label>
  );
}

export function SelectRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 truncate text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-7 flex-1 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
