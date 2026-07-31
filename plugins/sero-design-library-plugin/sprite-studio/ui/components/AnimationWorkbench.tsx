import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@sero-ai/ui';
import { useState } from 'react';

import type { AnimationRecord, LoopMode } from '../../shared/character';
import type { AnimationSummary } from '../../shared/state';
import { videoModelName } from '../../shared/video-models';
import { usePlayback } from '../hooks/usePlayback';
import type { EditableGrid } from '../lib/pixel-edit';
import { FrameEditor } from './FrameEditor';
import { FramePanel } from './FramePanel';
import { FrameStrip } from './FrameStrip';
import { Chip, Crumbs } from './PanelParts';
import { PlaybackStage, type StageOverlays } from './PlaybackStage';

/**
 * The workbench (prototype state 4).
 *
 * Playback owns the canvas, the frame strip sits underneath at working size,
 * and the numbers that matter stay as small chips. The frame editor appears in
 * place of the stage rather than in a window of its own.
 */

const PLAY_RATES = [8, 12, 15, 24, 30, 60];

const WORKING: Record<string, string> = {
  planned: 'Planned, and waiting to start',
  generating: 'Drawing the movement',
  'awaiting-frames': 'Pulling the frames out of the clip',
  compiling: 'Turning the frames into pixel art',
  judging: 'Checking the sequence',
};

export interface WorkbenchActions {
  setLoop(loop: LoopMode): void;
  setPlayRate(playRate: number): void;
  fix(instruction: string, frameId?: string): void;
  duplicateFrame(frameId: string): void;
  deleteFrame(frameId: string): void;
  writeFrame(frameId: string, grid: EditableGrid, palette: string[]): void;
  redo(instruction: string): void;
  addAnimations(): void;
  exportSheet(): void;
}

interface AnimationWorkbenchProps {
  summary: AnimationSummary;
  record: AnimationRecord | null;
  characterName: string;
  actions: WorkbenchActions;
}

export function AnimationWorkbench({
  summary,
  record,
  characterName,
  actions,
}: AnimationWorkbenchProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [overlays, setOverlays] = useState<StageOverlays>({
    onion: false,
    footLine: false,
    grid: false,
  });

  const frames = record?.frames ?? [];
  const playback = usePlayback(
    frames.map((frame) => frame.durationMs),
    summary.loop,
  );

  // The editor takes the place of the stage rather than opening a window, so it
  // is a branch of this surface rather than a screen of its own.
  const editing = editingIndex === null ? undefined : frames[editingIndex];
  if (editing !== undefined && editingIndex !== null && record !== null) {
    return (
      <FrameEditor
        animation={record}
        index={editingIndex}
        onDone={(grid, palette) => {
          actions.writeFrame(editing.id, grid, palette);
          setEditingIndex(null);
        }}
        onCancel={() => setEditingIndex(null)}
      />
    );
  }

  const working = WORKING[summary.status];

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-border flex items-center gap-2 border-b px-4 py-2.5">
          <Crumbs trail={[characterName]} last={summary.name} />
          <div className="ml-auto flex items-center gap-2">
            <Chip>{summary.frameCount} frames</Chip>
            <Select
              value={String(summary.playRate)}
              onValueChange={(value) => actions.setPlayRate(Number(value))}
            >
              <SelectTrigger className="h-8 w-24" aria-label="Play rate">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAY_RATES.map((rate) => (
                  <SelectItem key={rate} value={String(rate)}>
                    {rate} fps
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={summary.loop}
              onValueChange={(value) => actions.setLoop(value as LoopMode)}
            >
              <SelectTrigger className="h-8 w-32" aria-label="How it plays">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="once">Plays once</SelectItem>
                <SelectItem value="forward">Loops</SelectItem>
                <SelectItem value="pingpong">Ping-pong</SelectItem>
              </SelectContent>
            </Select>
            {record?.videoModel !== undefined && <Chip>{videoModelName(record.videoModel)}</Chip>}
            <Button type="button" size="sm" variant="outline" onClick={actions.addAnimations}>
              Add animation
            </Button>
            <Button type="button" size="sm" onClick={actions.exportSheet}>
              Export sheet
            </Button>
          </div>
        </div>

        {summary.error !== undefined ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-destructive text-sm">{summary.error}</p>
            <Button type="button" size="sm" variant="outline" onClick={() => actions.redo('')}>
              Run it again
            </Button>
          </div>
        ) : working !== undefined || record === null || frames.length === 0 ? (
          <div className="text-muted-foreground flex min-h-0 flex-1 items-center justify-center gap-2 text-sm">
            <Spinner className="size-4" />
            {summary.progress ?? working ?? 'Reading the animation'}
          </div>
        ) : (
          <>
            <PlaybackStage
              animation={record}
              playback={playback}
              overlays={overlays}
              onToggleOverlay={(overlay) =>
                setOverlays((current) => ({ ...current, [overlay]: !current[overlay] }))
              }
            />
            <FrameStrip
              animation={record}
              selectedIndex={playback.index}
              onSelect={playback.seek}
              onEdit={(frameId) =>
                setEditingIndex(frames.findIndex((frame) => frame.id === frameId))
              }
              onAddFrame={() => {
                const last = frames.at(-1);
                if (last !== undefined) actions.duplicateFrame(last.id);
              }}
            />
          </>
        )}
      </div>

      {record !== null && frames.length > 0 && (
        <FramePanel
          animation={record}
          index={playback.index}
          onEditPixels={() => setEditingIndex(playback.index)}
          onFix={(instruction) => actions.fix(instruction, frames[playback.index]?.id)}
          onDuplicate={() => {
            const frame = frames[playback.index];
            if (frame !== undefined) actions.duplicateFrame(frame.id);
          }}
          onDelete={() => {
            const frame = frames[playback.index];
            if (frame !== undefined) actions.deleteFrame(frame.id);
          }}
        />
      )}
    </div>
  );
}
