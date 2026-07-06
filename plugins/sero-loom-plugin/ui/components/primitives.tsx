import { useRef, type ReactNode } from 'react';

import { hexToRgb, rgbToHex } from '../lib/loom-ui';

/** Floating glass card — every Loom panel overlays the art. */
export function PanelCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="pointer-events-auto flex max-h-full w-80 flex-col overflow-hidden rounded-xl border border-border bg-background/85 shadow-xl backdrop-blur-md">
      <div className="border-b border-border/60 px-4 py-2.5">
        <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{title}</h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">{children}</div>
      {footer && <div className="border-t border-border/60 px-4 py-2.5">{footer}</div>}
    </div>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const resolvedStep = step ?? (max - min) / 200;
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 truncate text-muted-foreground">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={resolvedStep}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-secondary accent-primary"
      />
      <span className="w-10 shrink-0 text-right font-mono tabular-nums text-muted-foreground">
        {value.toFixed(resolvedStep >= 1 ? 0 : 2)}
      </span>
    </label>
  );
}

export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: [number, number, number];
  onChange: (v: [number, number, number]) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-24 shrink-0 truncate text-muted-foreground">{label}</span>
      <input
        type="color"
        value={rgbToHex(value)}
        onChange={(e) => onChange(hexToRgb(e.target.value))}
        className="h-7 w-12 cursor-pointer rounded-md border border-input bg-background p-0.5"
      />
      <span className="flex-1 text-right font-mono text-[10px] text-muted-foreground">{rgbToHex(value)}</span>
    </label>
  );
}

export function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-xs">
      <span className="w-24 shrink-0 truncate text-muted-foreground">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative h-5 w-9 rounded-full transition-colors ${value ? 'bg-primary' : 'bg-secondary'}`}
      >
        <span
          className={`absolute top-0.5 size-4 rounded-full bg-background shadow transition-all ${value ? 'left-4' : 'left-0.5'}`}
        />
      </button>
    </label>
  );
}

/** 2D pad — drag the dot; both axes are 0..1. */
export function XYPad({
  label,
  value,
  onChange,
}: {
  label: string;
  value: [number, number];
  onChange: (v: [number, number]) => void;
}) {
  const padRef = useRef<HTMLDivElement | null>(null);

  const fromEvent = (e: React.PointerEvent): [number, number] => {
    const rect = padRef.current!.getBoundingClientRect();
    return [
      Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, 1 - (e.clientY - rect.top) / rect.height)),
    ];
  };

  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="w-24 shrink-0 truncate pt-1 text-muted-foreground">{label}</span>
      <div
        ref={padRef}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          onChange(fromEvent(e));
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) onChange(fromEvent(e));
        }}
        className="relative h-24 w-24 cursor-crosshair rounded-md border border-input bg-secondary/50"
      >
        <span
          className="absolute size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border border-background bg-primary"
          style={{ left: `${value[0] * 100}%`, bottom: `${value[1] * 100}%` }}
        />
      </div>
    </div>
  );
}
