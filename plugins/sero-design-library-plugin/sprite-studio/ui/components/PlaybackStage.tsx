import { Grid3x3, Layers, Minus, Pause, Play } from 'lucide-react';

import type { AnimationRecord } from '../../shared/character';
import type { Playback } from '../hooks/usePlayback';
import { elapsedLabel } from '../lib/playback';
import { Chip } from './PanelParts';
import { CHECKER_STYLE, SpritePixels } from './SpritePixels';

/**
 * The sprite is the interface.
 *
 * Playback owns the canvas and runs at the animation's real rate, and the
 * numbers that matter stay as small chips rather than a panel of dials. Onion
 * skin, the foot line and the grid are the three things worth seeing over the
 * top of a sprite, and each is a toggle rather than a setting.
 */

/** Big enough to judge the drawing, small enough to leave the strip room. */
const STAGE_SCALE = 2;

export interface StageOverlays {
  onion: boolean;
  footLine: boolean;
  grid: boolean;
}

interface PlaybackStageProps {
  animation: AnimationRecord;
  playback: Playback;
  overlays: StageOverlays;
  onToggleOverlay(overlay: keyof StageOverlays): void;
}

function OverlayToggle({
  on,
  label,
  icon,
  onClick,
}: {
  on: boolean;
  label: string;
  icon: React.ReactNode;
  onClick(): void;
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}>
      <Chip tone={on ? 'on' : 'plain'}>
        {icon}
        {label}
      </Chip>
    </button>
  );
}

export function PlaybackStage({
  animation,
  playback,
  overlays,
  onToggleOverlay,
}: PlaybackStageProps) {
  const { canvas, anchor, frames, report } = animation;
  const frame = frames[playback.index];
  const before = frames[playback.index - 1];
  const after = frames[playback.index + 1];
  const size = { width: canvas.cols * STAGE_SCALE, height: canvas.rows * STAGE_SCALE };

  return (
    <div className="relative grid min-h-0 flex-1 place-items-center" style={CHECKER_STYLE}>
      <div className="absolute top-3 left-3 z-10 flex gap-1.5">
        <OverlayToggle
          on={overlays.onion}
          label="Onion skin"
          icon={<Layers className="size-3" />}
          onClick={() => onToggleOverlay('onion')}
        />
        <OverlayToggle
          on={overlays.footLine}
          label="Foot line"
          icon={<Minus className="size-3" />}
          onClick={() => onToggleOverlay('footLine')}
        />
        <OverlayToggle
          on={overlays.grid}
          label="Grid"
          icon={<Grid3x3 className="size-3" />}
          onClick={() => onToggleOverlay('grid')}
        />
      </div>

      {report !== null && (
        <div className="absolute top-3 right-3 z-10 flex gap-1.5">
          <Chip tone={report.offPalette > 0.02 ? 'warn' : 'on'}>
            palette {(report.offPalette * 100).toFixed(1)}% off
          </Chip>
          <Chip tone={report.drift === 0 ? 'on' : 'warn'}>drift {report.drift} px</Chip>
          {report.repairedFrames.length > 0 && (
            <Chip tone="warn">
              {report.repairedFrames.length === 1
                ? `frame ${(report.repairedFrames[0] ?? 0) + 1} repaired`
                : `${report.repairedFrames.length} frames repaired`}
            </Chip>
          )}
        </div>
      )}

      <div className="relative" style={size}>
        {overlays.onion &&
          [before, after].map(
            (neighbour, index) =>
              neighbour !== undefined && (
                <SpritePixels
                  key={neighbour.id}
                  path={neighbour.file}
                  version={animation.updatedAt}
                  cols={canvas.cols}
                  rows={canvas.rows}
                  scale={STAGE_SCALE}
                  alt=""
                  className="absolute inset-0"
                  style={{ opacity: 0.22, filter: 'grayscale(1)', zIndex: index }}
                />
              ),
          )}
        {frame !== undefined && (
          <SpritePixels
            path={frame.file}
            version={animation.updatedAt}
            cols={canvas.cols}
            rows={canvas.rows}
            scale={STAGE_SCALE}
            alt={`Frame ${playback.index + 1}`}
            className="absolute inset-0 z-10"
          />
        )}
        {overlays.grid && (
          <div
            className="pointer-events-none absolute inset-0 z-20"
            style={{
              backgroundImage:
                'linear-gradient(to right,rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(to bottom,rgba(255,255,255,.06) 1px,transparent 1px)',
              backgroundSize: `${STAGE_SCALE}px ${STAGE_SCALE}px`,
            }}
          />
        )}
        {overlays.footLine && (
          <div
            className="bg-primary/60 pointer-events-none absolute right-0 left-0 z-20 h-px"
            style={{ top: anchor.row * STAGE_SCALE }}
          />
        )}
      </div>

      <div className="border-border bg-background/90 absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-lg border px-2.5 py-1.5">
        <button
          type="button"
          onClick={playback.toggle}
          aria-label={playback.playing ? 'Pause' : 'Play'}
          className="bg-primary text-primary-foreground grid size-7 place-items-center rounded-md"
        >
          {playback.playing ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
        </button>
        <span className="text-muted-foreground font-mono text-xs">
          frame {playback.index + 1} / {frames.length}
        </span>
        <span className="text-muted-foreground font-mono text-xs">·</span>
        <span className="text-muted-foreground font-mono text-xs tabular-nums">
          {elapsedLabel(playback.positionMs)}
        </span>
        <button type="button" onClick={playback.cycleSpeed} aria-label="Playback speed">
          <Chip tone={playback.speed === 1 ? 'plain' : 'on'}>{playback.speed}×</Chip>
        </button>
      </div>
    </div>
  );
}
