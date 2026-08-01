import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sero-ai/ui';
import { Eraser, Layers, PaintBucket, Pencil, Pipette, Redo2, Undo2 } from 'lucide-react';
import { useState } from 'react';

import type { AnimationRecord } from '../../shared/character';
import { TRANSPARENT } from '../../engine/types';
import { useFrameCells } from '../hooks/useSpriteAsset';
import {
  cellAt,
  commit,
  fill,
  paint,
  redo,
  undo,
  EMPTY_HISTORY,
  type EditState,
  type EditableGrid,
} from '../lib/pixel-edit';
import { Chip, Crumbs } from './PanelParts';
import { PixelCanvas } from './PixelCanvas';
import { CHECKER_STYLE, SpritePixels } from './SpritePixels';

/**
 * Small fixes, nothing more (spec §6.2).
 *
 * Deliberately minimal, because the AI is expected to get it close. Colours
 * come from the character's palette only, so a hand edit cannot break the thing
 * the whole pipeline works to guarantee — there is no colour picker here, and
 * that is the point.
 *
 * It appears in place of the playback stage, so no new window and no new
 * chrome.
 */

type Tool = 'pencil' | 'eraser' | 'eyedropper' | 'fill';

const TOOLS: { tool: Tool; label: string; icon: React.ReactNode }[] = [
  { tool: 'pencil', label: 'Pencil', icon: <Pencil className="size-3.5" /> },
  { tool: 'eraser', label: 'Eraser', icon: <Eraser className="size-3.5" /> },
  { tool: 'eyedropper', label: 'Eyedropper', icon: <Pipette className="size-3.5" /> },
  { tool: 'fill', label: 'Fill', icon: <PaintBucket className="size-3.5" /> },
];

const SCALES = [2, 3, 4, 6, 8];

interface FrameEditorProps {
  animation: AnimationRecord;
  index: number;
  onDone(grid: EditableGrid, palette: string[]): void;
  onCancel(): void;
}

export function FrameEditor({ animation, index, onDone, onCancel }: FrameEditorProps) {
  const frame = animation.frames[index];
  const cells = useFrameCells(frame?.file);

  const [tool, setTool] = useState<Tool>('pencil');
  const [colour, setColour] = useState(0);
  const [scale, setScale] = useState(3);
  const [onion, setOnion] = useState(true);
  const [edit, setEdit] = useState<{ path: string; state: EditState } | null>(null);

  // Seeded once the cells arrive, and again only if a different frame is
  // opened. Re-seeding on every read would throw away the work in progress.
  if (cells !== null && frame !== undefined && edit?.path !== frame.file) {
    setEdit({
      path: frame.file,
      state: { grid: { cols: cells.cols, rows: cells.rows, cells: cells.cells }, history: EMPTY_HISTORY },
    });
  }

  if (frame === undefined) return null;
  const palette = cells?.palette ?? [];
  const state = edit?.state;

  const apply = (x: number, y: number, dragging: boolean) => {
    if (state === undefined) return;
    if (tool === 'eyedropper') {
      const picked = cellAt(state.grid, x, y);
      if (picked !== TRANSPARENT) setColour(picked);
      return;
    }
    // A fill is one action, so a drag across the canvas must not re-flood on
    // every cell it passes over.
    if (tool === 'fill' && dragging) return;
    const value = tool === 'eraser' ? TRANSPARENT : colour;
    const next = tool === 'fill' ? fill(state.grid, x, y, value) : paint(state.grid, x, y, value);
    setEdit((current) =>
      current === null ? current : { ...current, state: commit(current.state, next) },
    );
  };

  const step = (change: (state: EditState) => EditState) =>
    setEdit((current) => (current === null ? current : { ...current, state: change(current.state) }));

  const before = animation.frames[index - 1];
  const after = animation.frames[index + 1];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-border flex items-center gap-2 border-b px-4 py-2.5">
        <Crumbs trail={[{ label: animation.plan.name }]} last={`frame ${index + 1}`} />
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={() => setOnion(!onion)} aria-pressed={onion}>
            <Chip tone={onion ? 'on' : 'plain'}>
              <Layers className="size-3" />
              Onion skin
            </Chip>
          </button>
          <Select value={String(scale)} onValueChange={(value) => setScale(Number(value))}>
            <SelectTrigger className="h-8 w-20" aria-label="Zoom">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCALES.map((one) => (
                <SelectItem key={one} value={String(one)}>
                  {one}×
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Undo"
            disabled={state === undefined || state.history.past.length === 0}
            onClick={() => step(undo)}
          >
            <Undo2 className="size-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Redo"
            disabled={state === undefined || state.history.future.length === 0}
            onClick={() => step(redo)}
          >
            <Redo2 className="size-3.5" />
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={state === undefined}
            onClick={() => {
              if (state !== undefined) onDone(state.grid, palette);
            }}
          >
            Done editing
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="border-border flex w-12 shrink-0 flex-col items-center gap-1 border-r py-2.5">
          {TOOLS.map((entry) => (
            <button
              key={entry.tool}
              type="button"
              aria-label={entry.label}
              aria-pressed={tool === entry.tool}
              onClick={() => setTool(entry.tool)}
              className={`grid size-8 place-items-center rounded-md border ${
                tool === entry.tool
                  ? 'border-border bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground border-transparent'
              }`}
            >
              {entry.icon}
            </button>
          ))}
        </div>

        <div className="relative grid min-h-0 flex-1 place-items-center overflow-auto p-6">
          <div className="relative" style={CHECKER_STYLE}>
            {onion &&
              [before, after].map(
                (neighbour) =>
                  neighbour !== undefined && (
                    <SpritePixels
                      key={neighbour.id}
                      path={neighbour.file}
                      version={animation.updatedAt}
                      cols={animation.canvas.cols}
                      rows={animation.canvas.rows}
                      scale={scale}
                      alt=""
                      className="pointer-events-none absolute inset-0"
                      style={{ opacity: 0.22, filter: 'grayscale(1)' }}
                    />
                  ),
              )}
            {state !== undefined && (
              <PixelCanvas grid={state.grid} palette={palette} scale={scale} onCell={apply} />
            )}
          </div>
        </div>
      </div>

      <div className="border-border bg-card flex h-11 shrink-0 items-center gap-1 overflow-x-auto border-t px-3">
        <span className="text-muted-foreground mr-1.5 shrink-0 text-xs font-medium tracking-wide uppercase">
          Palette
        </span>
        {palette.map((hex, at) => (
          <button
            key={hex}
            type="button"
            aria-label={hex}
            aria-pressed={colour === at && tool !== 'eraser'}
            onClick={() => {
              setColour(at);
              if (tool === 'eraser') setTool('pencil');
            }}
            className={`size-5 shrink-0 rounded ${
              colour === at && tool !== 'eraser' ? 'outline-primary outline-2 outline-offset-1' : ''
            }`}
            style={{ background: hex }}
          />
        ))}
        <button
          type="button"
          className="ml-auto shrink-0"
          aria-pressed={tool === 'eraser'}
          onClick={() => setTool('eraser')}
        >
          <Chip tone={tool === 'eraser' ? 'on' : 'plain'}>transparent</Chip>
        </button>
      </div>
    </div>
  );
}
