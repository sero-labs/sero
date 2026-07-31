import { useEffect, useRef, useState } from 'react';

import { TRANSPARENT } from '../../engine/types';
import { cellFromPointer, type EditableGrid } from '../lib/pixel-edit';

/**
 * The grid being edited, drawn from cells rather than from a picture.
 *
 * A canvas at the artwork's true size, scaled up by CSS with nearest-neighbour
 * sampling: one art pixel is one canvas pixel, so what is drawn and what is
 * stored are the same thing and there is no resampling step to get wrong.
 */

interface PixelCanvasProps {
  grid: EditableGrid;
  palette: string[];
  scale: number;
  onCell(x: number, y: number, dragging: boolean): void;
}

function rgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16) || 0,
    Number.parseInt(value.slice(2, 4), 16) || 0,
    Number.parseInt(value.slice(4, 6), 16) || 0,
  ];
}

export function PixelCanvas({ grid, palette, scale, onCell }: PixelCanvasProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);

  // Painting a canvas is exactly the kind of external side effect an effect is
  // for: the pixels are not React's to hold.
  useEffect(() => {
    const context = canvas.current?.getContext('2d');
    if (!context) return;
    const image = context.createImageData(grid.cols, grid.rows);
    const colours = palette.map(rgb);
    for (let at = 0; at < grid.cols * grid.rows; at += 1) {
      const index = grid.cells[at] ?? TRANSPARENT;
      const colour = index === TRANSPARENT ? undefined : colours[index];
      if (colour === undefined) continue;
      image.data[at * 4] = colour[0];
      image.data[at * 4 + 1] = colour[1];
      image.data[at * 4 + 2] = colour[2];
      image.data[at * 4 + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  }, [grid, palette]);

  const report = (event: React.PointerEvent, dragging: boolean) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const cell = cellFromPointer(grid, bounds, event.clientX, event.clientY);
    if (cell !== null) onCell(cell.x, cell.y, dragging);
  };

  return (
    <canvas
      ref={canvas}
      width={grid.cols}
      height={grid.rows}
      className="touch-none"
      style={{
        width: grid.cols * scale,
        height: grid.rows * scale,
        imageRendering: 'pixelated',
      }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDrawing(true);
        report(event, false);
      }}
      onPointerMove={(event) => {
        if (drawing) report(event, true);
      }}
      onPointerUp={() => setDrawing(false)}
      onPointerCancel={() => setDrawing(false)}
    />
  );
}
