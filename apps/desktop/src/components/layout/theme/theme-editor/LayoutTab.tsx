/**
 * LayoutTab — spacing base unit and border radius controls.
 *
 * Tailwind 4 uses:
 *   --spacing   (base unit, default 0.25rem/4px) — p-4 = spacing * 4
 *   --radius    (base, ~10px) — --radius-sm/md/lg derived from it
 *
 * We expose "md" from the preset as the control value and derive the
 * Tailwind variable from it in the theme engine.
 */

import type { SpacingTokens, RadiusTokens } from '@/types/theme';
import { SliderRow } from './SliderRow';

interface LayoutTabProps {
  spacing: Required<SpacingTokens>;
  radius: Required<RadiusTokens>;
  onSpacingChange: (key: keyof SpacingTokens, value: string) => void;
  onRadiusChange: (key: keyof RadiusTokens, value: string) => void;
}

export function LayoutTab({
  spacing,
  radius,
  onSpacingChange,
  onRadiusChange,
}: LayoutTabProps) {
  const spacingMd = parseFloat(spacing.md) || 12;
  const radiusMd = parseFloat(radius.md) || 8;

  return (
    <div className="flex flex-col gap-6">
      {/* Spacing */}
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-xs font-semibold text-[var(--text-primary)]">
            Spacing
          </h3>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Base spacing unit — controls padding, margins, and gaps.
            Tailwind&apos;s <code className="font-mono text-[var(--accent-code)]">p-3</code> equals
            this value.
          </p>
        </div>
        <SliderRow
          label="Base"
          value={spacing.md}
          min={2}
          max={24}
          step={1}
          onChange={(v) => onSpacingChange('md', v)}
        />
        <SpacingPreview base={spacingMd} />
      </section>

      {/* Radius */}
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-xs font-semibold text-[var(--text-primary)]">
            Border radius
          </h3>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Base roundness — <code className="font-mono text-[var(--accent-code)]">rounded-lg</code> uses
            this value. Smaller sizes are derived automatically.
          </p>
        </div>
        <SliderRow
          label="Base"
          value={radius.md}
          min={0}
          max={24}
          step={1}
          onChange={(v) => onRadiusChange('md', v)}
        />
        <RadiusPreview base={radiusMd} />
      </section>
    </div>
  );
}

// ── Live previews ────────────────────────────────────────────

function SpacingPreview({ base }: { base: number }) {
  // Show how common Tailwind multipliers look with this base
  const samples = [
    { label: 'p-1', mult: base / 3 },
    { label: 'p-2', mult: (base / 3) * 2 },
    { label: 'p-3', mult: base },
    { label: 'p-4', mult: (base / 3) * 4 },
    { label: 'p-6', mult: (base / 3) * 6 },
  ];

  return (
    <div className="mt-1 flex items-end gap-2">
      {samples.map((s) => (
        <div key={s.label} className="flex flex-col items-center gap-1">
          <div
            className="bg-[var(--accent-primary)] rounded-sm opacity-50"
            style={{ width: `${s.mult}px`, height: `${s.mult}px` }}
          />
          <span className="text-[9px] text-[var(--text-muted)] font-mono">
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function RadiusPreview({ base }: { base: number }) {
  const sizes = [
    { label: 'sm', value: Math.max(0, base - 4) },
    { label: 'md', value: Math.max(0, base - 2) },
    { label: 'lg', value: base },
  ];

  return (
    <div className="mt-1 flex items-center gap-3">
      {sizes.map((s) => (
        <div key={s.label} className="flex flex-col items-center gap-1">
          <div
            className="size-10 border-2 border-[var(--accent-primary)] opacity-50"
            style={{ borderRadius: `${s.value}px` }}
          />
          <span className="text-[9px] text-[var(--text-muted)] font-mono">
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}
