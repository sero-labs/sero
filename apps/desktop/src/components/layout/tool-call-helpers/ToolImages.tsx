import { useCallback, useMemo } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { ToolResultImage } from '@/types/ipc';
import { useEditorBridge } from '@/stores/editor-bridge';
import { useLightbox, type LightboxImage } from '../ImageLightbox';
import { looksLikeFilePath } from '../ClickableFilePath';

export function ToolImages({
  images,
  workspaceId = null,
}: {
  images: ToolResultImage[];
  workspaceId?: string | null;
}) {
  const showLightbox = useLightbox((state) => state.show);
  const requestOpenFile = useEditorBridge((state) => state.requestOpenFile);

  const lightboxImages: LightboxImage[] = useMemo(
    () =>
      images.map((image) => ({
        src: image.data,
        mimeType: image.mimeType,
        alt: image.description,
      })),
    [images],
  );

  const handlePreview = useCallback(
    (index: number) => showLightbox(lightboxImages, index),
    [lightboxImages, showLightbox],
  );

  const handlePathClick = useCallback(
    (filePath: string) => {
      if (!workspaceId) return;
      requestOpenFile(workspaceId, filePath);
    },
    [requestOpenFile, workspaceId],
  );

  return (
    <div className="flex flex-wrap gap-3 py-1">
      {images.map((image, index) => {
        const src = image.data.startsWith('data:')
          ? image.data
          : `data:${image.mimeType ?? 'image/png'};base64,${image.data}`;
        const isOpenablePath = !!workspaceId && !!image.filePath && looksLikeFilePath(image.filePath);

        return (
          <div key={`${image.filePath ?? image.description ?? 'image'}:${src}`} className="flex max-w-[220px] flex-col gap-1.5">
            <button type="button"
              onClick={() => handlePreview(index)}
              className={cn(
                'group/img relative overflow-hidden rounded-md border border-[var(--border-subtle)]',
                'cursor-pointer transition-all hover:border-[var(--accent-primary)] hover:shadow-md',
                'focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]',
              )}
              title={image.description ?? 'Click to preview'}
            >
              <img
                src={src}
                alt={image.description ?? 'Tool result image'}
                className="h-24 w-auto max-w-[200px] object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-black/0 transition-colors group-hover/img:bg-black/10" />
            </button>
            {image.filePath ? (
              isOpenablePath ? (
                <button type="button"
                  onClick={() => handlePathClick(image.filePath!)}
                  className="truncate rounded bg-[var(--bg-elevated)] px-2 py-1 text-left font-mono text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                  title={`Open ${image.filePath} in editor`}
                >
                  {image.filePath}
                </button>
              ) : (
                <div
                  className="truncate rounded bg-[var(--bg-elevated)] px-2 py-1 font-mono text-sm text-[var(--text-secondary)]"
                  title={image.filePath}
                >
                  {image.filePath}
                </div>
              )
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
