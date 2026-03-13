/**
 * Image lightbox — fullscreen overlay for viewing images at full resolution.
 * Click the backdrop or press Escape to close.
 */

import { memo, useCallback } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

export const ImageLightbox = memo(function ImageLightbox({
  src,
  alt,
  onClose,
}: ImageLightboxProps) {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    },
    [onClose],
  );

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center',
        'bg-black/80 backdrop-blur-sm',
      )}
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="dialog"
      aria-label="Image preview"
    >
      <button
        onClick={onClose}
        className={cn(
          'absolute top-4 right-4 z-10',
          'w-8 h-8 rounded-full bg-black/50 text-white',
          'flex items-center justify-center',
          'hover:bg-black/70 transition-colors',
        )}
        aria-label="Close"
      >
        <X className="w-5 h-5" />
      </button>

      <img
        src={src}
        alt={alt ?? 'Full-size preview'}
        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg"
      />
    </div>
  );
});
