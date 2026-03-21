/**
 * VideoPreview — renders video files (mp4, webm, mov, etc.)
 * as a centred player instead of garbled binary in the code editor.
 *
 * Loads the file as base64 via the `readBinaryFile` IPC, converts to a
 * Blob → blob URL (more memory-efficient than data URLs for larger files),
 * and renders a native <video> element with controls.
 */

import { useEffect, useState, useRef } from 'react';
import { Video, Loader2, AlertCircle } from 'lucide-react';

const VIDEO_EXTENSIONS = new Set([
  'mp4', 'webm', 'mov', 'ogg', 'avi',
]);

const MIME_MAP: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  ogg: 'video/ogg',
  avi: 'video/x-msvideo',
};

/** Check if a file path is a video based on its extension. */
export function isVideoFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return VIDEO_EXTENSIONS.has(ext);
}

function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return MIME_MAP[ext] ?? 'video/mp4';
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

export function VideoPreview({ workspaceId, filePath }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBlobUrl(null);
    setFileSize(null);

    // Revoke previous blob URL if any
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    (async () => {
      try {
        const base64 = await window.sero.editor.readBinaryFile(workspaceId, filePath);
        if (cancelled) return;

        // Decode base64 to bytes
        const binaryStr = atob(base64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }

        const mime = getMimeType(filePath);
        const blob = new Blob([bytes], { type: mime });
        const url = URL.createObjectURL(blob);

        blobUrlRef.current = url;
        setBlobUrl(url);
        setFileSize(bytes.byteLength);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load video');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [workspaceId, filePath]);

  const fileName = filePath.split('/').pop() ?? filePath;

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
        <Loader2 className="size-6 animate-spin" />
        <p className="text-sm">Loading video…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
        <AlertCircle className="size-6 text-destructive" />
        <p className="text-sm">Failed to load video</p>
        <p className="text-xs opacity-60">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center overflow-auto bg-[var(--bg-base)]">
      {/* Metadata bar */}
      <div className="flex w-full items-center gap-3 border-b border-[var(--border)] px-4 py-2 text-xs text-[var(--text-muted)]">
        <Video className="size-3.5 shrink-0" />
        <span className="font-medium text-[var(--text-secondary)]">{fileName}</span>
        {fileSize !== null && (
          <span>{formatBytes(fileSize)}</span>
        )}
      </div>

      {/* Video player — centred */}
      <div className="flex flex-1 items-center justify-center p-8">
        {blobUrl && (
          <video
            src={blobUrl}
            controls
            className="max-h-full max-w-full rounded-md shadow-lg"
          />
        )}
      </div>
    </div>
  );
}
