/**
 * Gallery — bento-box layout of generated images.
 *
 * Assigns varying sizes based on image count and aspect ratio:
 *   - Feature items (first, or single-image wide ratio) get 2-col span
 *   - Montages (multi-image) get square cells
 *   - Others fill 1-col slots
 *
 * Items animate in with staggered delays.
 */

import { useState, useMemo } from 'react';
import { cn } from '@sero/ui/lib/utils';
import type { Generation } from '../../shared/types';
import { MontageCard } from './MontageCard';
import { ImageViewer } from './ImageViewer';

interface GalleryProps {
  generations: Generation[];
}

type BentoSize = 'large' | 'tall' | 'wide' | 'normal';

function computeBentoSize(gen: Generation, index: number): BentoSize {
  const isWide = ['16:9', '3:2', '4:3'].includes(gen.aspectRatio);
  const isTall = ['9:16', '2:3', '3:4'].includes(gen.aspectRatio);
  const isMulti = gen.images.length > 1;

  // First item or every 5th is featured
  if (index === 0) return isWide ? 'wide' : 'large';
  if (index % 5 === 0) return 'large';

  if (isMulti) return 'normal';
  if (isWide) return 'wide';
  if (isTall) return 'tall';
  return 'normal';
}

const sizeStyles: Record<BentoSize, string> = {
  large: 'col-span-2 row-span-2',
  wide: 'col-span-2 row-span-1',
  tall: 'col-span-1 row-span-2',
  normal: 'col-span-1 row-span-1',
};

const sizeHeights: Record<BentoSize, number> = {
  large: 360,
  wide: 200,
  tall: 360,
  normal: 200,
};

export function Gallery({ generations }: GalleryProps) {
  const [viewer, setViewer] = useState<{ gen: Generation; index: number } | null>(null);

  const items = useMemo(
    () =>
      generations.map((gen, i) => ({
        generation: gen,
        size: computeBentoSize(gen, i),
      })),
    [generations],
  );

  const openViewer = (gen: Generation, imgIndex: number) => {
    setViewer({ gen, index: imgIndex });
  };

  return (
    <>
      <div
        className={cn(
          'grid auto-rows-[180px] gap-3',
          'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
        )}
      >
        {items.map(({ generation, size }, i) => (
          <div
            key={generation.id}
            className={cn(sizeStyles[size], 'animate-fade-in-up')}
            style={{
              animationDelay: `${Math.min(i * 60, 400)}ms`,
              minHeight: sizeHeights[size],
            }}
          >
            <MontageCard
              generation={generation}
              onClick={openViewer}
              style={{ height: '100%' }}
            />
          </div>
        ))}
      </div>

      {/* Full-size viewer overlay */}
      {viewer && (
        <ImageViewer
          generation={viewer.gen}
          initialIndex={viewer.index}
          onClose={() => setViewer(null)}
        />
      )}
    </>
  );
}
