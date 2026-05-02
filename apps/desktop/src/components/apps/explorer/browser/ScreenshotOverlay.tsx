/**
 * ScreenshotOverlay — modal region picker shown over the browser viewport.
 *
 * Behaviour:
 *   - Renders the full-page PNG as the backdrop.
 *   - User drags a rect; on release the rect is cropped out of the PNG
 *     and returned as a Blob via `onCapture`.
 *   - Esc cancels.
 *
 * The overlay is positioned to cover the same area the WebContentsView
 * normally occupies — the parent is responsible for hiding the view
 * while the overlay is up and for restoring it on close.
 */

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { Check, X } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';

interface ScreenshotOverlayProps {
  /** Base64 PNG (no data URI prefix) of the full page at current viewport. */
  pngBase64: string;
  /** The rect the browser view occupies in viewport coordinates (for layout). */
  viewRect: { x: number; y: number; width: number; height: number };
  onCapture: (blob: Blob) => void;
  onCancel: () => void;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function ScreenshotOverlay({
  pngBase64, viewRect, onCapture, onCancel,
}: ScreenshotOverlayProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const localCoords = (e: MouseEvent) => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0 };
    const b = el.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(b.width, e.clientX - b.left)),
      y: Math.max(0, Math.min(b.height, e.clientY - b.top)),
    };
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const pt = localCoords(e);
    startRef.current = pt;
    setRect({ x: pt.x, y: pt.y, w: 0, h: 0 });
    setDragging(true);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!dragging || !startRef.current) return;
    const pt = localCoords(e);
    const s = startRef.current;
    setRect({
      x: Math.min(s.x, pt.x),
      y: Math.min(s.y, pt.y),
      w: Math.abs(pt.x - s.x),
      h: Math.abs(pt.y - s.y),
    });
  };

  const handleMouseUp = () => {
    setDragging(false);
  };

  const confirm = useCallback(async () => {
    if (!rect || rect.w < 4 || rect.h < 4) return;
    const img = imgRef.current;
    const container = containerRef.current;
    if (!img || !container) return;

    // Image is rendered at container size (CSS) but has native pixel
    // dimensions from the capture. Scale the selection back into native
    // pixels so we crop accurately.
    const scaleX = img.naturalWidth / container.clientWidth;
    const scaleY = img.naturalHeight / container.clientHeight;

    const sx = Math.round(rect.x * scaleX);
    const sy = Math.round(rect.y * scaleY);
    const sw = Math.max(1, Math.round(rect.w * scaleX));
    const sh = Math.max(1, Math.round(rect.h * scaleY));

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    const blob: Blob | null = await new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), 'image/png');
    });
    if (blob) onCapture(blob);
  }, [rect, onCapture]);

  return (
    <div
      className="fixed z-50 select-none"
      style={{
        left: viewRect.x,
        top: viewRect.y,
        width: viewRect.width,
        height: viewRect.height,
      }}
    >
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="relative h-full w-full cursor-crosshair overflow-hidden bg-black/50"
      >
        <img
          ref={imgRef}
          src={`data:image/png;base64,${pngBase64}`}
          alt=""
          className="pointer-events-none absolute inset-0 h-full w-full object-fill opacity-90"
          draggable={false}
        />
        {/* Dim everything outside the selected rect */}
        <div
          className="pointer-events-none absolute inset-0 bg-black/50"
          style={rect ? {
            clipPath: `polygon(
              0 0, 100% 0, 100% 100%, 0 100%, 0 0,
              ${rect.x}px ${rect.y}px,
              ${rect.x}px ${rect.y + rect.h}px,
              ${rect.x + rect.w}px ${rect.y + rect.h}px,
              ${rect.x + rect.w}px ${rect.y}px,
              ${rect.x}px ${rect.y}px
            )`,
          } : undefined}
        />
        {rect && rect.w > 0 && rect.h > 0 && (
          <div
            className="pointer-events-none absolute border-2 border-[var(--accent-primary)]"
            style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
          />
        )}
      </div>

      <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-[var(--bg-elevated)] px-3 py-1.5 text-[11px] text-[var(--text-secondary)] shadow-lg ring-1 ring-[var(--border-default)]">
          <span>Drag to select an area · Esc to cancel</span>
          <button
            onClick={confirm}
            disabled={!rect || rect.w < 4 || rect.h < 4}
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-0.5',
              'bg-[var(--accent-primary)] text-white',
              'disabled:cursor-not-allowed disabled:opacity-40',
            )}
          >
            <Check className="size-3" />
            Attach
          </button>
          <button
            onClick={onCancel}
            className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[var(--text-muted)] hover:bg-[var(--bg-base)]"
          >
            <X className="size-3" />
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
