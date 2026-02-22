/**
 * MontageCard — displays a generation as a single tile or 2×2 montage.
 *
 * Single images show as a full card. Multi-image generations show a 2×2
 * grid with a subtle count badge. Click opens the ImageViewer.
 */

import { cn } from '@sero/ui/lib/utils';
import type { Generation } from '../../shared/types';
import { useImageBatchLoader } from '../hooks/use-image-loader';

interface MontageCardProps {
  generation: Generation;
  onClick: (generation: Generation, imageIndex: number) => void;
  style?: React.CSSProperties;
}

function Skeleton() {
  return <div className="absolute inset-0 animate-shimmer rounded-lg bg-secondary" />;
}

export function MontageCard({ generation, onClick, style }: MontageCardProps) {
  const filePaths = generation.images.map((img) => img.filePath);
  const { images, loading } = useImageBatchLoader(filePaths);
  const count = generation.images.length;
  const isMontage = count > 1;

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
