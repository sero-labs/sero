/**
 * ImageGenWidget — recent generations gallery for the dashboard.
 *
 * Shows the latest generated images in a compact masonry-style grid
 * with hover overlays showing the prompt. Includes a generation
 * counter with a gradient accent.
 */

import { useMemo } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import type { ImageGenState, Generation } from '../../shared/types';
import { DEFAULT_STATE } from '../../shared/types';
import { useImageLoader } from '../hooks/use-image-loader';

// ── Component ────────────────────────────────────────────────────

export function ImageGenWidget() {
  const [state] = useAppState<ImageGenState>(DEFAULT_STATE);

  const recentGens = useMemo(() => {
    return [...state.generations]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 6);
  }, [state.generations]);

  const totalImages = useMemo(() => {
    return state.generations.reduce((sum, g) => sum + g.images.length, 0);
  }, [state.generations]);

  if (state.generations.length === 0) {
    return <EmptyGallery />;
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="bg-gradient-to-r from-fuchsia-400 to-violet-400 bg-clip-text text-lg font-bold tabular-nums text-transparent"
          >
            {totalImages}
          </span>
          <span className="text-xs text-[var(--text-muted)]">images</span>
        </div>
        <span className="text-[10px] tabular-nums text-[var(--text-muted)]">
          {state.generations.length} generations
        </span>
      </div>

      {/* ── Gallery grid ── */}
      <div className="grid min-h-0 flex-1 grid-cols-3 gap-1 overflow-hidden">
        {recentGens.map((gen) => (
          <GenCard key={gen.id} generation={gen} />
        ))}
      </div>
    </div>
  );
}

// ── Generation card ──────────────────────────────────────────────

function GenCard({ generation }: { generation: Generation }) {
  const firstImage = generation.images[0];
  const { dataUri, loading } = useImageLoader(firstImage?.filePath);

  // Build the aspect ratio for the card
  const aspectClass = getAspectClass(generation.aspectRatio);

  return (
    <div
      className={`group relative overflow-hidden rounded-md bg-[var(--bg-elevated)] ${aspectClass}`}
    >
      {firstImage ? (
        <div className="absolute inset-0">
          {dataUri ? (
            <img
              src={dataUri}
              alt={generation.prompt}
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div
              className="absolute inset-0 bg-gradient-to-br from-fuchsia-500/20 via-violet-500/15 to-cyan-500/20"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-br from-black/0 via-transparent to-black/10" />
          {loading && !dataUri && (
            <div className="absolute inset-0 animate-pulse bg-white/5" />
          )}
          {/* Prompt overlay on hover */}
          <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 to-transparent p-1.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
            <span className="line-clamp-2 text-[9px] leading-tight text-white">
              {generation.prompt}
            </span>
          </div>
          {/* Image count badge */}
          {generation.images.length > 1 && (
            <div className="absolute right-1 top-1 rounded-full bg-black/50 px-1 py-0.5">
              <span className="text-[8px] font-bold text-white">
                {generation.images.length}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-full items-center justify-center">
          <span className="text-[9px] text-[var(--text-muted)]">No image</span>
        </div>
      )}
    </div>
  );
}

// ── Aspect ratio mapping ─────────────────────────────────────────

function getAspectClass(ratio: string): string {
  switch (ratio) {
    case '16:9': return 'aspect-video';
    case '9:16': return 'aspect-[9/16]';
    case '3:2': return 'aspect-[3/2]';
    case '2:3': return 'aspect-[2/3]';
    case '4:3': return 'aspect-[4/3]';
    case '3:4': return 'aspect-[3/4]';
    default: return 'aspect-square';
  }
}

// ── Empty state ──────────────────────────────────────────────────

function EmptyGallery() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-3">
      {/* Animated gradient orb */}
      <div className="relative size-14">
        <div
          className="absolute inset-0 rounded-2xl bg-gradient-to-br from-fuchsia-500/25 via-violet-500/20 to-cyan-500/25"
          style={{
            animation: 'pulse 3s ease-in-out infinite',
          }}
        />
        <div
          className="absolute inset-2 rounded-xl bg-gradient-to-tr from-fuchsia-400/15 to-violet-400/15"
          style={{
            animation: 'pulse 3s ease-in-out 0.5s infinite',
          }}
        />
        {/* Image icon */}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="absolute inset-0 m-auto size-6 text-[var(--text-muted)]"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      </div>
      <span className="text-xs text-[var(--text-muted)]">No images generated</span>
    </div>
  );
}

export default ImageGenWidget;
