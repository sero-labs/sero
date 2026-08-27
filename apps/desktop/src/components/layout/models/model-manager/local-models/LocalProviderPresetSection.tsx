import type { LocalProviderPreset } from '@/types/local-models';
import { PROVIDER_PRESETS, PRESET_ORDER } from './presets';
import { LocalProviderField } from './LocalProviderField';

interface LocalProviderPresetSectionProps {
  onSelect: (preset: LocalProviderPreset) => void;
}

export function LocalProviderPresetSection({ onSelect }: LocalProviderPresetSectionProps) {
  return (
    <LocalProviderField label="Quick Setup">
      <div className="grid grid-cols-5 gap-1.5">
        {PRESET_ORDER.map((preset) => {
          const cfg = PROVIDER_PRESETS[preset];
          return (
            <button type="button"
              key={preset}
              onClick={() => onSelect(preset)}
              className="rounded-lg border border-[var(--border-subtle)] p-2
                text-center text-sm font-medium text-[var(--text-secondary)]
                transition-colors hover:border-[var(--border-default)]
                hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
            >
              {cfg.label}
            </button>
          );
        })}
      </div>
    </LocalProviderField>
  );
}
