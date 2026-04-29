/**
 * ImageLightbox — full-screen modal overlay for previewing images.
 *
 * Supports:
 * - Click-to-dismiss (click backdrop)
 * - Escape to close
 * - Open in new window (popout)
 * - Zoom with scroll wheel
 * - Multiple images with left/right navigation
 *
 * State is managed via a simple Zustand store (see useLightbox below).
 */

import { useCallback, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { create } from 'zustand';
import { AnimatePresence, motion } from 'motion/react';
import {
  X,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';

// ── Types ───────────────────────────────────────────────────

export interface LightboxImage {
  /** Data URL or base64 data (will be wrapped as data: URL if raw). */
  src: string;
  /** MIME type for base64 data. */
  mimeType?: string;
  /** Optional alt text / description. */
  alt?: string;
}

// ── Zustand store ───────────────────────────────────────────

interface LightboxState {
  open: boolean;
  images: LightboxImage[];
  index: number;
  show: (images: LightboxImage[], startIndex?: number) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
}

export const useLightbox = create<LightboxState>((set, get) => ({
  open: false,
  images: [],
  index: 0,
  show: (images, startIndex = 0) =>
    set({ open: true, images, index: Math.min(startIndex, images.length - 1) }),
  close: () => set({ open: false }),
  next: () => set((s) => ({ index: Math.min(s.index + 1, s.images.length - 1) })),
  prev: () => set((s) => ({ index: Math.max(s.index - 1, 0) })),
}));

// ── Helper: ensure src is a valid data URL ──────────────────

function toDataUrl(image: LightboxImage): string {
  if (image.src.startsWith('data:') || image.src.startsWith('http') || image.src.startsWith('blob:')) {
    return image.src;
  }
  // Raw base64 — wrap with data URI
  const mime = image.mimeType ?? 'image/png';
  return `data:${mime};base64,${image.src}`;
}

// ── Popout helper ───────────────────────────────────────────

function openInNewWindow(image: LightboxImage) {
  const url = toDataUrl(image);
  const win = window.open('', '_blank', 'width=900,height=700');
  if (!win) return;
  win.document.title = image.alt ?? 'Image Preview';
  win.document.body.style.cssText = 'margin:0;background:#111;display:flex;align-items:center;justify-content:center;height:100vh;';
  const img = win.document.createElement('img');
  img.src = url;
  img.alt = image.alt ?? 'Image';
  img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;';
  win.document.body.appendChild(img);
}

// ── Main lightbox component ─────────────────────────────────

export function ImageLightbox() {
  const { open, images, index, close, next, prev } = useLightbox();
  const current = images[index];
  const hasMultiple = images.length > 1;
  const [zoom, setZoom] = useState(1);

  // Reset zoom when image changes
  const resetZoom = useCallback(() => setZoom(1), []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((z) => Math.max(0.25, Math.min(5, z - e.deltaY * 0.002)));
  }, []);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        close();
        resetZoom();
      }
    },
    [close, resetZoom],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') { close(); resetZoom(); }
      else if (e.key === 'ArrowRight' && hasMultiple) { next(); resetZoom(); }
      else if (e.key === 'ArrowLeft' && hasMultiple) { prev(); resetZoom(); }
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(5, z + 0.25));
      else if (e.key === '-') setZoom((z) => Math.max(0.25, z - 0.25));
      else if (e.key === '0') resetZoom();
    },
    [close, next, prev, hasMultiple, resetZoom],
  );

  const src = useMemo(() => (current ? toDataUrl(current) : ''), [current]);

  // Focus the overlay on mount so keyboard shortcuts work immediately
  const focusRef = useCallback((node: HTMLDivElement | null) => {
    if (node) requestAnimationFrame(() => node.focus());
  }, []);

  return createPortal(
    <AnimatePresence>
      {open && current && (
        <motion.div
          ref={focusRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={handleBackdropClick}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          role="dialog"
          aria-label="Image preview"
        >
          {/* Toolbar */}
          <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
            <ToolbarButton onClick={() => setZoom((z) => Math.min(5, z + 0.5))} title="Zoom in">
              <ZoomIn className="size-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => setZoom((z) => Math.max(0.25, z - 0.5))} title="Zoom out">
              <ZoomOut className="size-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => openInNewWindow(current)} title="Open in new window">
              <ExternalLink className="size-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => { close(); resetZoom(); }} title="Close (Esc)">
              <X className="size-4" />
            </ToolbarButton>
          </div>

          {/* Navigation arrows */}
          {hasMultiple && index > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); prev(); resetZoom(); }}
              className="absolute left-3 z-10 rounded-full bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20"
            >
              <ChevronLeft className="size-6" />
            </button>
          )}
          {hasMultiple && index < images.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); next(); resetZoom(); }}
              className="absolute right-3 z-10 rounded-full bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20"
            >
              <ChevronRight className="size-6" />
            </button>
          )}

          {/* Image */}
          <motion.img
            key={`${index}-${src.slice(0, 40)}`}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.15 }}
            src={src}
            alt={current.alt ?? 'Preview'}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
            style={{ transform: `scale(${zoom})`, transition: 'transform 0.1s ease-out' }}
            onWheel={handleWheel}
            draggable={false}
          />

          {/* Caption + counter */}
          <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-1">
            {current.alt && (
              <span className="rounded bg-black/60 px-2 py-0.5 text-xs text-white/80">
                {current.alt}
              </span>
            )}
            {hasMultiple && (
              <span className="text-xs text-white/50">
                {index + 1} / {images.length}
              </span>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ── Toolbar button ──────────────────────────────────────────

function ToolbarButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      title={title}
      className={cn(
        'rounded-md p-1.5 text-white/70 transition-colors',
        'hover:bg-white/15 hover:text-white',
      )}
    >
      {children}
    </button>
  );
}
