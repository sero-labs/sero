import { Button } from '@sero-ai/ui';

import {
  PARTICLE_BUDGET,
  type CaptureResolution,
  type LoomConfig,
  type LoomSettings,
  type Paradigm,
  type Quality,
} from '../../shared/types';

type OnLive = (recipe: (d: LoomConfig) => void) => void;
type OnSettings = (recipe: (s: LoomSettings) => void) => void;

const PARADIGMS: readonly Paradigm[] = ['raymarch', 'particles'];
const QUALITIES: readonly Quality[] = ['low', 'medium', 'high'];
const RESOLUTIONS: readonly CaptureResolution[] = ['display', '1080p', '1440p', '4k', 'custom'];

export function Transport({
  config,
  settings,
  onLive,
  onSettings,
  onCapture,
  capturing,
  captureMsg,
}: {
  config: LoomConfig;
  settings: LoomSettings;
  onLive: OnLive;
  onSettings: OnSettings;
  onCapture: () => void;
  capturing: boolean;
  captureMsg: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1 rounded-md bg-secondary/40 p-1">
        {PARADIGMS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onLive((d) => { d.paradigm = p; })}
            className={`flex-1 rounded px-2 py-1 text-xs capitalize transition-colors ${
              config.paradigm === p ? 'bg-background font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={() => onSettings((s) => { s.paused = !s.paused; })}>
          {settings.paused ? '▶ Play' : '⏸ Pause'}
        </Button>
        <select
          value={settings.quality}
          onChange={(e) => {
            const q = e.target.value as Quality;
            onSettings((s) => { s.quality = q; });
            onLive((d) => { d.particles.count = PARTICLE_BUDGET[q]; });
          }}
          aria-label="Quality"
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {QUALITIES.map((q) => (
            <option key={q} value={q}>{q}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="flex-1 bg-gradient-to-br from-sky-500 to-cyan-500 text-white hover:from-sky-500/90 hover:to-cyan-500/90"
          onClick={onCapture}
          disabled={capturing}
          title="Capture a wallpaper PNG"
        >
          {capturing ? 'Capturing…' : '📷 Capture wallpaper'}
        </Button>
        <select
          value={settings.capture.resolution}
          onChange={(e) => {
            const r = e.target.value as CaptureResolution;
            onSettings((s) => { s.capture.resolution = r; });
          }}
          aria-label="Capture resolution"
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {RESOLUTIONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      {captureMsg && <span className="truncate text-[11px] text-muted-foreground">{captureMsg}</span>}
    </div>
  );
}
