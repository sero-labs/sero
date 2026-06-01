/**
 * Image lightbox, fullscreen overlay for viewing images at full resolution.
 * Click the backdrop or press Escape to close.
 */

import { memo, useEffect, useRef } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import { Button } from '@sero-ai/ui/components/ui/button';
import { X } from 'lucide-react';

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
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className={cn(
        'fixed inset-0 z-50 m-0 h-dvh max-h-none w-dvw max-w-none border-0 bg-transparent p-0',
        'backdrop:bg-black/80 backdrop:backdrop-blur-sm',
      )}
      onCancel={onClose}
      aria-label="Image preview"
    >
      <button
        type="button"
        aria-label="Close image preview"
        className="absolute inset-0 cursor-zoom-out"
        onClick={onClose}
      />
      <div className="flex h-full w-full items-center justify-center">
        <Button
          onClick={onClose}
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4 z-10 text-white hover:bg-white/20"
          aria-label="Close"
        >
          <X className="size-5" />
        </Button>

        <img
          src={src}
          alt={alt ?? 'Full-size preview'}
          className="relative max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
        />
      </div>
    </dialog>
  );
});
