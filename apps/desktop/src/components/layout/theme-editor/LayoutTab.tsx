/**
 * LayoutTab — spacing scale and border radius controls for the theme editor.
 */

import type { SpacingTokens, RadiusTokens } from '@/types/theme';
import { SliderRow } from './SliderRow';

interface LayoutTabProps {
  spacing: Required<SpacingTokens>;
  radius: Required<RadiusTokens>;
  onSpacingChange: (key: keyof SpacingTokens, value: string) => void;
  onRadiusChange: (key: keyof RadiusTokens, value: string) => void;
}

const SPACING_LABELS: Array<{ key: keyof SpacingTokens; label: string }> = [
  { key: 'xs', label: 'XS' },
  { key: 'sm', label: 'SM' },
  { key: 'md', label: 'MD' },
  { key: 'lg', label: 'LG' },
  { key: 'xl', label: 'XL' },
];

const RADIUS_LABELS: Array<{ key: keyof RadiusTokens; label: string }> = [
  { key: 'sm', label: 'SM' },
  { key: 'md', label: 'MD' },
  { key: 'lg', label: 'LG' },
];

export function LayoutTab({
  spacing,
  radius,
  onSpacingChange,
  onRadiusChange,
}: LayoutTabProps) {
  return (
    <div className="flex flex-col gap-6">
      {/* Spacing */}
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-xs font-semibold text-[var(--text-primary)]">
            Spacing
          </h3>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Controls padding, margins, and gaps throughout the UI.
          </p>
        </div>
        {SPACING_LABELS.map(({ key, label }) => (
          <SliderRow
            key={key}
            label={label}
            value={spacing[key]}
            min={0}
            max={64}
            step={1}
            onChange={(v) => onSpacingChange(key, v)}
          />
        ))}
        <SpacingPreview spacing={spacing} />
      </section>

      {/* Radius */}
      <section className="flex flex-col gap-3">
        <div>
          <h3 className="text-xs font-semibold text-[var(--text-primary)]">
            Border radius
          </h3>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            Roundness of buttons, cards, inputs, and containers.
          </p>
        </div>
        {RADIUS_LABELS.map(({ key, label }) => (
          <SliderRow
            key={key}
            label={label}
            value={radius[key]}
            min={0}
            max={24}
            step={1}
            onChange={(v) => onRadiusChange(key, v)}
          />
        ))}
        <RadiusPreview radius={radius} />
      </section>
    </div>
  );
}

// ── Live previews ────────────────────────────────────────────

function SpacingPreview({ spacing }: { spacing: Required<SpacingTokens> }) {
  return (
    <div className="mt-1 flex items-end gap-1">
      {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((key) => (
        <div key={key} className="flex flex-col items-center gap-1">
          <div
            className="bg-[var(--accent-primary)] rounded-sm opacity-60"
            style={{ width: spacing[key], height: spacing[key] }}
          />
          <span className="text-[9px] text-[var(--text-muted)] tabular-nums">
            {key}
          </span>
        </div>
      ))}
    </div>
  );
}

function RadiusPreview({ radius }: { radius: Required<RadiusTokens> }) {
  return (
    <div className="mt-1 flex items-center gap-3">
      {(['sm', 'md', 'lg'] as const).map((key) => (
        <div key={key} className="flex flex-col items-center gap-1">
          <div
            className="size-10 border-2 border-[var(--accent-primary)] opacity-60"
            style={{ borderRadius: radius[key] }}
          />
          <span className="text-[9px] text-[var(--text-muted)] tabular-nums">
            {key}
          </span>
        </div>
      ))}
    </div>
  );
}
