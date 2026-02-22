/**
 * MontageCard — displays a generation as a single tile or 2×2 montage.
 *
 * Single images show as a full card. Multi-image generations show a 2×2
 * grid with a subtle count badge. Click opens the ImageViewer.
 */

import { useState } from 'react';
import { cn } from '@sero/ui/lib/utils';
import { Button } from '@sero/ui/components/ui/button';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@sero/ui/components/ui/popover';
import type { Generation } from '../../shared/types';
import { useImageBatchLoader } from '../hooks/use-image-loader';

interface MontageCardProps {
  generation: Generation;
  onClick: (generation: Generation, imageIndex: number) => void;
  onDelete?: (generationId: number) => void;
  style?: React.CSSProperties;
}

function Skeleton() {
  return <div className="absolute inset-0 animate-shimmer rounded-lg bg-secondary" />;
}

export function MontageCard({ generation, onClick, onDelete, style }: MontageCardProps) {
  const filePaths = generation.images.map((img) => img.filePath);
  const { images, loading } = useImageBatchLoader(filePaths);
  const count = generation.images.length;
  const isMontage = count > 1;
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div
      className="group relative cursor-pointer overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-border/50 transition-all duration-300 hover:shadow-lg hover:ring-border hover:scale-[1.02]"
      style={style}
      onClick={() => onClick(generation, 0)}
    >
      {/* Image(s) */}
      {isMontage ? (
        <div className="grid grid-cols-2 grid-rows-2 gap-0.5 p-0.5 h-full">
          {generation.images.slice(0, 4).map((img, i) => {
            const uri = images.get(img.filePath);
            return (
              <div
                key={img.id}
                className="relative overflow-hidden rounded-md bg-secondary"
                onClick={(e) => { e.stopPropagation(); onClick(generation, i); }}
              >
                {loading && !uri ? (
                  <Skeleton />
                ) : uri ? (
                  <img
                    src={uri}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="relative h-full w-full bg-secondary">
          {loading ? (
            <Skeleton />
          ) : images.get(filePaths[0]) ? (
            <img
              src={images.get(filePaths[0])}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : null}
        </div>
      )}

      {/* Delete button */}
      {onDelete && (
        <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
            <PopoverTrigger asChild>
              <button
                onClick={(e) => { e.stopPropagation(); setConfirmOpen(true); }}
                className="rounded-full bg-black/40 p-1.5 text-white/70 backdrop-blur-sm transition-colors hover:bg-red-500/80 hover:text-white"
                aria-label="Delete image"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M5.5 2h5M2.5 4h11M6 4v8M10 4v8M3.5 4l.5 9.5a1 1 0 001 .5h6a1 1 0 001-.5L12.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="bottom"
              align="end"
              className="w-56 p-3"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-sm font-medium text-foreground">Delete image?</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {count > 1 ? `${count} images` : '1 image'} will be permanently removed.
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => { e.stopPropagation(); setConfirmOpen(false); }}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmOpen(false);
                    onDelete(generation.id);
                  }}
                >
                  Delete
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {/* Overlay info */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 py-2.5 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        <p className="line-clamp-2 text-xs font-medium text-white/90">
          {generation.prompt}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <span className="text-[10px] font-mono text-white/60">
            {generation.model.includes('pro') ? '✨ Pro' : '⚡ Flash'}
          </span>
          <span className="text-[10px] text-white/40">{generation.aspectRatio}</span>
          {isMontage && (
            <span className="ml-auto rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-medium text-white/80 backdrop-blur-sm">
              {count} images
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
