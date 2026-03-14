/**
 * HtmlPreview — renders HTML files in a sandboxed iframe.
 *
 * Uses a blob: URL so the content is fully isolated from the parent
 * renderer process. The iframe `sandbox="allow-scripts"` allows JS
 * execution (needed for interactive diagrams, charts, etc.) but gives
 * the frame a unique opaque origin — it cannot access the parent page,
 * cookies, localStorage, or anything in the host renderer.
 *
 * Limitation: relative asset paths (e.g. `<img src="./foo.png">`) will
 * not resolve because the blob: origin has no filesystem context. This
 * is fine for self-contained HTML files (inline CSS/JS, data: images).
 */

import { useEffect, useState } from 'react';
import { FileCode2, Loader2 } from 'lucide-react';

const HTML_EXTENSIONS = new Set(['html', 'htm']);

/** Check if a file path is an HTML file based on its extension. */
export function isHtmlFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return HTML_EXTENSIONS.has(ext);
}

interface Props {
  content: string;
  filePath: string;
}

export function HtmlPreview({ content, filePath }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  // Create / recreate blob URL whenever content changes, and revoke the
  // previous one to avoid memory leaks.
  useEffect(() => {
    if (!content) {
      setBlobUrl(null);
      return;
    }

    const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [content]);

  const fileName = filePath.split('/').pop() ?? filePath;

  if (!blobUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--text-muted)]">
        <Loader2 className="size-6 animate-spin" />
        <p className="text-sm">Loading preview…</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--bg-base)]">
      {/* Metadata bar */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-2 text-xs text-[var(--text-muted)]">
        <FileCode2 className="size-3.5 shrink-0" />
        <span className="font-medium text-[var(--text-secondary)]">{fileName}</span>
        <span>HTML Preview</span>
      </div>

      {/* Sandboxed iframe — allow-scripts for interactive content,
          but no allow-same-origin so the frame stays fully isolated. */}
      <iframe
        src={blobUrl}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        title={`Preview: ${fileName}`}
        className="flex-1 w-full border-0"
      />
    </div>
  );
}
