/**
 * TypographyTab, font family pickers and base font size slider.
 */

import type { TypographyTokens } from '@/types/theme';
import { FontPicker, SANS_PRESETS, MONO_PRESETS } from './FontPicker';
import { SliderRow } from './SliderRow';

interface TypographyTabProps {
  typography: Required<TypographyTokens>;
  onChange: (key: keyof TypographyTokens, value: string) => void;
}

export function TypographyTab({ typography, onChange }: TypographyTabProps) {
  return (
    <div className="flex flex-col gap-5">
      <FontPicker
        label="Sans-serif (UI text)"
        value={typography.fontSans}
        presets={SANS_PRESETS}
        onChange={(v) => onChange('fontSans', v)}
      />

      <FontPicker
        label="Monospace (code, terminals)"
        value={typography.fontMono}
        presets={MONO_PRESETS}
        onChange={(v) => onChange('fontMono', v)}
      />

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-[var(--text-secondary)]">
          Base font size
        </span>
        <SliderRow
          label=""
          value={typography.fontSizeBase}
          min={10}
          max={20}
          step={1}
          onChange={(v) => onChange('fontSizeBase', v)}
        />
        <p className="text-[11px] text-[var(--text-muted)]">
          Controls the root <code className="font-mono text-[var(--accent-code)]">font-size</code> on{' '}
          <code className="font-mono text-[var(--accent-code)]">&lt;html&gt;</code>. All relative sizes scale from this.
        </p>
      </div>
    </div>
  );
}
