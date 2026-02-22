/**
 * ImageViewer — full-size overlay with backdrop blur and smooth transitions.
 *
 * Shows individual images from a generation. Arrow keys / click navigate
 * between images. Click outside or Escape closes.
 */

import { useEffect, useCallback, useState } from 'react';
import { cn } from '@sero/ui/lib/utils';
import { Button } from '@sero/ui/components/ui/button';
import type { Generation } from '../../shared/types';
import { useImageLoader } from '../hooks/use-image-loader';

interface ImageViewerProps {
  generation: Generation;
  initialIndex: number;
  onClose: () => void;
}

export function ImageViewer({ generation, initialIndex, onClose }: ImageViewerProps) {
  const [index, setIndex] = useState(initialIndex);
  const [closing, setClosing] = useState(false);
  const image = generation.images[index];
  const { dataUri, loading } = useImageLoader(image?.filePath);
  const total = generation.images.length;

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(onClose, 200);
  }, [onClose]);

  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + total) % total);
  }, [total]);

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % total);
  }, [total]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') prev();
      else if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [close, prev, next]);

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xl',
        closing ? 'animate-overlay-out' : 'animate-overlay-in',
      )}
      onClick={close}
    >
      {/* Close button */}
      <button
        onClick={close}
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white/70 backdrop-blur-sm transition-colors hover:bg-white/20 hover:text-white"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {/* Main image */}
      <div
        className="relative max-h-[85vh] max-w-[85vw] animate-viewer-image"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex h-64 w-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        ) : dataUri ? (
          <img
            key={image.id}
            src={dataUri}
            alt={generation.prompt}
            className="max-h-[85vh] max-w-[85vw] rounded-xl object-contain shadow-2xl animate-fade-in-scale"
          />
        ) : null}
      </div>

      {/* Navigation arrows */}
      {total > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white/70 backdrop-blur-sm transition-all hover:bg-white/20 hover:text-white hover:scale-110"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12 4L6 10L12 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-3 text-white/70 backdrop-blur-sm transition-all hover:bg-white/20 hover:text-white hover:scale-110"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M8 4L14 10L8 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </>
      )}

      {/* Bottom info bar */}
      <div
        className="absolute inset-x-0 bottom-0 flex items-center justify-between px-6 py-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="max-w-[60%]">
          <p className="text-sm font-medium text-white/90 line-clamp-1">
            {generation.prompt}
          </p>
          <p className="mt-0.5 text-xs text-white/50">
            {generation.model.includes('pro') ? '✨ Nano Banana Pro' : '⚡ Nano Banana'}
            {' · '}{generation.aspectRatio}
          </p>
        </div>
        {total > 1 && (
          <div className="flex items-center gap-1.5">
            {generation.images.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                className={cn(
                  'h-2 w-2 rounded-full transition-all duration-200',
                  i === index
                    ? 'bg-white w-4'
                    : 'bg-white/30 hover:bg-white/50',
                )}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
