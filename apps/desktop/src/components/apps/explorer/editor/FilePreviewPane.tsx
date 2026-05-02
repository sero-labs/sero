/**
 * FilePreviewPane — unified preview surface for markdown, HTML, and
 * registry-backed binary media files.
 *
 * Markdown preview intentionally continues to use Streamdown.
 */

import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import {
  AlertCircle,
  FileText,
  ImageIcon,
  Loader2,
  Music2,
  Video,
} from 'lucide-react';
import { Streamdown } from 'streamdown';
import { createCodePlugin } from '@streamdown/code';
import { math } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';
import { HtmlPreview } from './HtmlPreview';
import { resolveEditorThemePalette, resolveMarkdownCodeThemes } from './monaco-themes';
import { useAppStore } from '@/stores/app';
import { useThemeStore } from '@/stores/theme';
import type {
  BinaryPreviewKind,
  BinaryPreviewSpec,
  FilePreviewSpec,
} from './file-preview-registry';

interface Props {
  workspaceId: string;
  filePath: string;
  content: string;
  spec: FilePreviewSpec;
}

interface BinaryFilePreviewProps {
  workspaceId: string;
  filePath: string;
  spec: BinaryPreviewSpec;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function decodeBase64(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return buffer;
}

function renderBinaryPreviewIcon(kind: BinaryPreviewKind) {
  switch (kind) {
    case 'image':
      return <ImageIcon className="size-3.5 shrink-0" />;
    case 'video':
      return <Video className="size-3.5 shrink-0" />;
    case 'audio':
      return <Music2 className="size-3.5 shrink-0" />;
    case 'pdf':
      return <FileText className="size-3.5 shrink-0" />;
  }
}

function BinaryFilePreview({ workspaceId, filePath, spec }: BinaryFilePreviewProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setBlobUrl(null);
    setFileSize(null);
    setDimensions(null);

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    (async () => {
      try {
        const base64 = await window.sero.editor.readBinaryFile(workspaceId, filePath);
        if (cancelled) return;

        const buffer = decodeBase64(base64);
        const blob = new Blob([buffer], { type: spec.mimeType });
        const nextBlobUrl = URL.createObjectURL(blob);

        blobUrlRef.current = nextBlobUrl;
        setBlobUrl(nextBlobUrl);
        setFileSize(buffer.byteLength);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : `Failed to load ${spec.kind}`);
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
  }, [workspaceId, filePath, spec.kind, spec.mimeType]);

  const fileName = filePath.split('/').pop() ?? filePath;

  const handleImageLoad = (event: SyntheticEvent<HTMLImageElement>) => {
    const img = event.currentTarget;
    setDimensions({ w: img.naturalWidth, h: img.naturalHeight });
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
        <Loader2 className="size-6 animate-spin" />
        <p className="text-sm">Loading {spec.kind}…</p>
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
        <AlertCircle className="size-6 text-destructive" />
        <p className="text-sm">Failed to load {spec.kind}</p>
        {error && <p className="text-xs opacity-60">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--bg-base)]">
      <div className="flex w-full items-center gap-3 border-b border-[var(--border)] px-4 py-2 text-xs text-[var(--text-muted)]">
        {renderBinaryPreviewIcon(spec.kind)}
        <span className="font-medium text-[var(--text-secondary)]">{fileName}</span>
        <span>{spec.label}</span>
        {dimensions && <span>{dimensions.w} × {dimensions.h}</span>}
        {fileSize !== null && <span>{formatBytes(fileSize)}</span>}
      </div>

      {spec.kind === 'pdf' ? (
        <div className="min-h-0 flex-1 bg-[var(--bg-elevated)] p-4">
          <div className="h-full overflow-hidden rounded-lg border border-[var(--border)] bg-white shadow-lg">
            <iframe
              src={blobUrl}
              title={`Preview: ${fileName}`}
              className="h-full w-full border-0"
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-1 items-center justify-center overflow-auto p-8">
          {spec.kind === 'image' ? (
            <img
              src={blobUrl}
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
          ) : spec.kind === 'video' ? (
            <video
              src={blobUrl}
              controls
              className="max-h-full max-w-full rounded-md shadow-lg"
            />
          ) : (
            <div className="w-full max-w-2xl rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6 shadow-sm">
              <audio
                src={blobUrl}
                controls
                className="w-full"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FilePreviewPane({ workspaceId, filePath, content, spec }: Props) {
  const editorThemeId = useAppStore((state) => state.editorThemeId);
  const effectiveMode = useThemeStore((state) => state.effectiveMode);
  const markdownPalette = useMemo(
    () => resolveEditorThemePalette(editorThemeId, effectiveMode),
    [editorThemeId, effectiveMode],
  );
  const markdownPlugins = useMemo(
    () => ({
      code: createCodePlugin({ themes: resolveMarkdownCodeThemes(editorThemeId) }),
      math,
      mermaid,
    }),
    [editorThemeId],
  );

  if (spec.source === 'text') {
    if (spec.kind === 'html') {
      return <HtmlPreview content={content} filePath={filePath} />;
    }

    return (
      <div
        className="h-full overflow-auto"
        style={{
          backgroundColor: markdownPalette.background,
          color: markdownPalette.foreground,
        }}
      >
        <div className="mx-auto w-full max-w-[920px] px-6 py-5">
          <Streamdown
            mode="static"
            plugins={markdownPlugins}
          >
            {content}
          </Streamdown>
        </div>
      </div>
    );
  }

  return (
    <BinaryFilePreview
      workspaceId={workspaceId}
      filePath={filePath}
      spec={spec}
    />
  );
}
