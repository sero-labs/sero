import { memo } from 'react';

import type { CaptureResolution, LoomSettings } from '../../shared/types';
import { PanelCard, Slider, ToggleField } from './primitives';

const RESOLUTIONS: CaptureResolution[] = ['display', '1080p', '1440p', '4k', 'custom'];

export const SettingsPanel = memo(function SettingsPanel({
  settings,
  onChange,
}: {
  settings: LoomSettings;
  onChange: (recipe: (s: LoomSettings) => void) => void;
}) {
  return (
    <PanelCard title="Settings">
      <Slider label="Speed" value={settings.speed} min={0} max={3} step={0.05} onChange={(v) => onChange((s) => { s.speed = v; })} />
      <Slider
        label="Transition"
        value={settings.transitionMs / 1000}
        min={0}
        max={5}
        step={0.1}
        onChange={(v) => onChange((s) => { s.transitionMs = Math.round(v * 1000); })}
      />

      <div className="flex flex-col gap-2.5 border-t border-border/60 pt-3">
        <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Wallpaper capture</span>
        <label className="flex items-center gap-2 text-xs">
          <span className="w-24 shrink-0 text-muted-foreground">Resolution</span>
          <select
            value={settings.capture.resolution}
            onChange={(e) => onChange((s) => { s.capture.resolution = e.target.value as CaptureResolution; })}
            className="h-7 flex-1 rounded-md border border-input bg-background/60 px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {RESOLUTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        {settings.capture.resolution === 'custom' && (
          <div className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 text-muted-foreground">Size</span>
            {(['customWidth', 'customHeight'] as const).map((key) => (
              <input
                key={key}
                type="number"
                min={16}
                max={7680}
                value={settings.capture[key]}
                onChange={(e) => onChange((s) => { s.capture[key] = Math.round(Number(e.target.value) || 16); })}
                className="h-7 w-20 rounded-md border border-input bg-background/60 px-2 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
            ))}
          </div>
        )}
        <ToggleField
          label="Save piece JSON"
          value={settings.capture.writeSidecarConfig}
          onChange={(v) => onChange((s) => { s.capture.writeSidecarConfig = v; })}
        />
      </div>
    </PanelCard>
  );
});
