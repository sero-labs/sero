/**
 * ImagePreview — renders image files (png, jpg, gif, webp, svg, etc.)
 * as a centered preview instead of garbled binary in the code editor.
 *
 * Loads the file as base64 via the `readBinaryFile` IPC, then displays
 * it as a data: URL in an <img> tag. Shows file size and dimensions.
 */

import { useEffect, useState } from 'react';
import { ImageIcon, Loader2, AlertCircle } from 'lucide-react';

const IMAGE_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'tiff', 'tif',
]);

const MIME_MAP: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml',
  bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif',
  tiff: 'image/tiff', tif: 'image/tiff',
};

/** Check if a file path is an image based on its extension. */
export function isImageFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return IMAGE_EXTENSIONS.has(ext);
}

function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return MIME_MAP[ext] ?? 'image/png';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface Props {
  workspaceId: string;
  filePath: string;
}

export function ImagePreview({ workspaceId, filePath }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);
  const [fileSize, setFileSize] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDataUrl(null);
    setDimensions(null);

    (async () => {
      try {
        const base64 = await window.sero.editor.readBinaryFile(workspaceId, filePath);
        if (cancelled) return;

        const mime = getMimeType(filePath);
        const url = `data:${mime};base64,${base64}`;
        setDataUrl(url);
        setFileSize(Math.round(base64.length * 0.75)); // base64 → bytes approx
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load image');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [workspaceId, filePath]);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDimensions({ w: img.naturalWidth, h: img.naturalHeight });
  };

  const fileName = filePath.split('/').pop() ?? filePath;

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
        <Loader2 className="size-6 animate-spin" />
        <p className="text-sm">Loading image…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
        <AlertCircle className="size-6 text-destructive" />
        <p className="text-sm">Failed to load image</p>
        <p className="text-xs opacity-60">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center overflow-auto bg-[var(--bg-base)]">
      {/* Metadata bar */}
      <div className="flex w-full items-center gap-3 border-b border-[var(--border)] px-4 py-2 text-xs text-[var(--text-muted)]">
        <ImageIcon className="size-3.5 shrink-0" />
        <span className="font-medium text-[var(--text-secondary)]">{fileName}</span>
        {dimensions && (
          <span>{dimensions.w} × {dimensions.h}</span>
        )}
        {fileSize !== null && (
          <span>{formatBytes(fileSize)}</span>
        )}
      </div>

      {/* Image — centered with checkerboard background for transparency */}
      <div className="flex flex-1 items-center justify-center p-8">
        {dataUrl && (
          <img
            src={dataUrl}
            alt={fileName}
            onLoad={handleImageLoad}
            className="max-h-full max-w-full rounded-md object-contain shadow-lg"
            style={{
              backgroundImage:
                'linear-gradient(45deg, var(--bg-elevated) 25%, transparent 25%), ' +
                'linear-gradient(-45deg, var(--bg-elevated) 25%, transparent 25%), ' +
                'linear-gradient(45deg, transparent 75%, var(--bg-elevated) 75%), ' +
                'linear-gradient(-45deg, transparent 75%, var(--bg-elevated) 75%)',
              backgroundSize: '16px 16px',
              backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
            }}
          />
        )}
      </div>
    </div>
  );
}
