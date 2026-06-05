import { Button } from '@sero-ai/ui';

import type { CaptureResolution } from '../../shared/types';
import { Slider } from './primitives';

const RESOLUTIONS: readonly CaptureResolution[] = ['display', '1080p', '1440p', '4k', 'custom'];

export function Transport({
  speed,
  paused,
  captureResolution,
  onSpeed,
  onTogglePause,
  onCaptureResolution,
  onCapture,
  capturing,
  captureMsg,
}: {
  speed: number;
  paused: boolean;
  captureResolution: CaptureResolution;
  onSpeed: (v: number) => void;
  onTogglePause: () => void;
  onCaptureResolution: (r: CaptureResolution) => void;
  onCapture: () => void;
  capturing: boolean;
  captureMsg: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onTogglePause}>
          {paused ? '▶' : '⏸'}
        </Button>
        <div className="flex-1">
          <Slider label="speed" value={speed} min={0} max={4} onChange={onSpeed} />
        </div>
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
          value={captureResolution}
          onChange={(e) => onCaptureResolution(e.target.value as CaptureResolution)}
          aria-label="Capture resolution"
          className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {RESOLUTIONS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      {captureMsg && <span className="truncate text-[11px] text-muted-foreground">{captureMsg}</span>}
    </div>
  );
}
