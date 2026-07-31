/**
 * Laying finished frames into one sheet.
 *
 * Still pure: cells in, cells out. The buffer this returns is one palette index
 * per pixel with `TRANSPARENT` where nothing is drawn, which is what the PNG
 * encoder in the runtime writes straight into an indexed file — no RGBA stage
 * exists anywhere between the quantiser and the disk (D2).
 *
 * The canvas is per animation and derived from its own frames (D13), so a sheet
 * holding several animations has rows of different heights unless the user asks
 * for one cell size for every animation. That option costs empty space in every
 * idle row, which is why it is a choice rather than the default (D19).
 */

import type { CellGrid, LoopMode } from './types';
import { TRANSPARENT } from './types';

export interface SheetAnimation {
  name: string;
  loop: LoopMode;
  /** Playback rate the animation was planned at, carried through to the atlas. */
  playRate: number;
  frames: { cells: CellGrid; durationMs: number }[];
  /** The character's root within this animation's canvas. */
  anchorCol: number;
  anchorRow: number;
}

export type SheetLayout = 'rows' | 'single-row';

export interface SheetOptions {
  layout?: SheetLayout;
  /** Whole numbers only, or the pixels blur (D3). */
  scale?: number;
  /** Pad every animation up to the largest canvas, for engines wanting a grid. */
  uniformCell?: boolean;
  /** Drop empty margin shared by every frame of an animation. */
  trim?: boolean;
}

export interface PlacedFrame {
  animation: string;
  /** Index within the animation. */
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  durationMs: number;
}

export interface PlacedAnimation {
  name: string;
  loop: LoopMode;
  playRate: number;
  from: number;
  to: number;
  /** The root, in sheet pixels relative to a frame's top-left corner. */
  anchorX: number;
  anchorY: number;
}

export interface Sheet {
  width: number;
  height: number;
  /** One palette index per pixel; `TRANSPARENT` where nothing is drawn. */
  cells: Int16Array;
  frames: PlacedFrame[];
  animations: PlacedAnimation[];
}

/** The margin every frame of an animation shares, in cells. */
function trimBox(animation: SheetAnimation): { x: number; y: number; cols: number; rows: number } {
  const first = animation.frames[0]?.cells;
  if (first === undefined) return { x: 0, y: 0, cols: 0, rows: 0 };
  let minX = first.cols;
  let minY = first.rows;
  let maxX = -1;
  let maxY = -1;
  for (const frame of animation.frames) {
    const { cols, rows, cells } = frame.cells;
    for (let y = 0; y < rows; y++)
      for (let x = 0; x < cols; x++)
        if ((cells[y * cols + x] ?? TRANSPARENT) >= 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
  }
  if (maxX < 0) return { x: 0, y: 0, cols: first.cols, rows: first.rows };
  return { x: minX, y: minY, cols: maxX - minX + 1, rows: maxY - minY + 1 };
}

export function buildSheet(animations: SheetAnimation[], options: SheetOptions = {}): Sheet {
  const scale = Math.max(1, Math.round(options.scale ?? 1));
  const layout = options.layout ?? 'rows';

  const boxes = animations.map((animation) =>
    options.trim
      ? trimBox(animation)
      : {
          x: 0,
          y: 0,
          cols: animation.frames[0]?.cells.cols ?? 0,
          rows: animation.frames[0]?.cells.rows ?? 0,
        },
  );

  const cellCols = options.uniformCell ? Math.max(0, ...boxes.map((box) => box.cols)) : 0;
  const cellRows = options.uniformCell ? Math.max(0, ...boxes.map((box) => box.rows)) : 0;

  const sized = animations.map((animation, i) => {
    const box = boxes[i] ?? { x: 0, y: 0, cols: 0, rows: 0 };
    const width = (options.uniformCell ? cellCols : box.cols) * scale;
    const height = (options.uniformCell ? cellRows : box.rows) * scale;
    // Centring inside a uniform cell would move the root, so the extra space
    // goes below and to the right and the anchor stays where it was.
    return { animation, box, width, height };
  });

  const width =
    layout === 'single-row'
      ? sized.reduce((sum, entry) => sum + entry.width * entry.animation.frames.length, 0)
      : Math.max(0, ...sized.map((entry) => entry.width * entry.animation.frames.length));
  const height =
    layout === 'single-row'
      ? Math.max(0, ...sized.map((entry) => entry.height))
      : sized.reduce((sum, entry) => sum + entry.height, 0);

  const cells = new Int16Array(Math.max(0, width * height)).fill(TRANSPARENT);
  const frames: PlacedFrame[] = [];
  const placed: PlacedAnimation[] = [];

  let cursorX = 0;
  let cursorY = 0;
  for (const { animation, box, width: frameWidth, height: frameHeight } of sized) {
    const from = frames.length;
    for (const [index, frame] of animation.frames.entries()) {
      const originX = layout === 'single-row' ? cursorX : index * frameWidth;
      const originY = layout === 'single-row' ? 0 : cursorY;
      for (let y = 0; y < frameHeight; y++)
        for (let x = 0; x < frameWidth; x++) {
          const sourceX = box.x + Math.floor(x / scale);
          const sourceY = box.y + Math.floor(y / scale);
          if (sourceX >= frame.cells.cols || sourceY >= frame.cells.rows) continue;
          const value = frame.cells.cells[sourceY * frame.cells.cols + sourceX] ?? TRANSPARENT;
          if (value < 0) continue;
          cells[(originY + y) * width + originX + x] = value;
        }
      frames.push({
        animation: animation.name,
        index,
        x: originX,
        y: originY,
        width: frameWidth,
        height: frameHeight,
        durationMs: frame.durationMs,
      });
      if (layout === 'single-row') cursorX += frameWidth;
    }
    placed.push({
      name: animation.name,
      loop: animation.loop,
      playRate: animation.playRate,
      from,
      to: frames.length - 1,
      anchorX: (animation.anchorCol - box.x) * scale,
      anchorY: (animation.anchorRow - box.y) * scale,
    });
    if (layout === 'rows') cursorY += frameHeight;
  }

  return { width, height, cells, frames, animations: placed };
}

/**
 * The whole-number scale nearest a requested pixel height, and what it really
 * produces. A request for 512 px from a 136 px character resolves to 4× and
 * says 544 rather than silently blurring the pixels with 3.76× (D3).
 */
export function resolveScale(artHeight: number, requestedHeight: number): { scale: number; height: number } {
  if (artHeight <= 0) return { scale: 1, height: 0 };
  const scale = Math.max(1, Math.round(requestedHeight / artHeight));
  return { scale, height: scale * artHeight };
}
