import { AlertTriangle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
  PREVIEW_MESSAGE_SOURCE,
  isPreviewMessage,
  type PreviewMessage,
} from '../../../shared/preview-message';
import { usePreviewDocument, type PreviewTarget } from '../../hooks/usePreviewDocument';

/**
 * The isolated frame a generated design runs in (spec §7).
 *
 * `sandbox="allow-scripts"` without `allow-same-origin` is what does the work:
 * the page gets a unique opaque origin, so cookies, storage, the parent DOM and
 * same-origin requests are gone before any of its code runs. The document's own
 * `default-src 'none'` policy closes the network, and the harness inside it
 * reports anything the page tried so the block has an explanation.
 *
 * Warnings are rendered here, outside the frame. Inside it they would be part of
 * the design, which is both a lie about the output and trivially hidden by the
 * page itself.
 */

/** Anything more is noise; the count says how much was left out. */
const VISIBLE_WARNINGS = 4;

export interface PreviewFrameProps {
  target: PreviewTarget | null;
  /** Recorded at build time — refused imports, stripped remote references. */
  buildWarnings: string[];
  title: string;
}

export function PreviewFrame({ target, buildWarnings, title }: PreviewFrameProps) {
  const { url, error, loading } = usePreviewDocument(target);
  const [runtimeMessages, setRuntimeMessages] = useState<PreviewMessage[]>([]);
  const frame = useRef<HTMLIFrameElement>(null);
  // Counted rather than flagged: the first load is the document being put there,
  // and any load after it is the page navigating itself somewhere else.
  const loads = useRef(0);

  const report = (message: PreviewMessage) =>
    setRuntimeMessages((current) =>
      current.some(
        (entry) => entry.capability === message.capability && entry.detail === message.detail,
      )
        ? current
        : [...current, message],
    );

  // The frame is a separate document; its reports arrive as window messages,
  // which is a genuine external event source rather than derived state.
  useEffect(() => {
    setRuntimeMessages([]);
    loads.current = 0;
    const onMessage = (event: MessageEvent) => {
      // Bound to this frame's own window. Anything else that can post into this
      // renderer could otherwise fabricate a warning — or, worse, suppress one
      // by claiming a capability was already reported.
      if (event.source !== frame.current?.contentWindow) return;
      if (!isPreviewMessage(event.data) || event.data.kind === 'ready') return;
      report(event.data);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [url]);

  /**
   * The backstop for the one escape in-page code cannot block: `window.location`
   * is [Unforgeable], so a page can always assign to it and replace itself. The
   * navigated document keeps the sandbox flags — no Sero, no storage, no
   * filesystem — but it would have a network and would no longer carry this
   * document's policy. So the frame is put back, and the attempt is reported
   * rather than passing unnoticed.
   */
  const onLoad = () => {
    loads.current += 1;
    if (loads.current <= 1 || url === null) return;
    report({
      source: PREVIEW_MESSAGE_SOURCE,
      kind: 'blocked',
      capability: 'navigation',
      detail: 'the page tried to load a different document',
    });
    if (frame.current) frame.current.src = url;
  };

  const warnings = [
    ...buildWarnings,
    ...runtimeMessages.map((message) =>
      message.kind === 'blocked'
        ? `Blocked ${message.capability}${message.detail === '' ? '' : ` — ${message.detail}`}`
        : `Script error — ${message.detail}`,
    ),
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="border-border bg-muted/30 relative min-h-0 flex-1 overflow-hidden rounded-md border">
        {url === null ? (
          <p className="text-muted-foreground flex h-full items-center justify-center text-sm">
            {loading ? 'Loading the preview…' : (error ?? 'Nothing to preview yet.')}
          </p>
        ) : (
          <iframe
            key={url}
            ref={frame}
            src={url}
            onLoad={onLoad}
            title={title}
            // No `allow-same-origin`: with it the frame would share this
            // document's origin and the whole boundary would be decorative.
            sandbox="allow-scripts"
            referrerPolicy="no-referrer"
            className="size-full border-0 bg-white"
          />
        )}
      </div>

      {warnings.length > 0 && <PreviewWarnings warnings={warnings} />}
    </div>
  );
}

function PreviewWarnings({ warnings }: { warnings: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? warnings : warnings.slice(0, VISIBLE_WARNINGS);
  const hidden = warnings.length - shown.length;

  return (
    <div className="border-border bg-muted/40 rounded-md border p-2.5 text-sm">
      <p className="text-muted-foreground flex items-center gap-1.5 font-medium">
        <AlertTriangle className="size-3.5" />
        {warnings.length} thing{warnings.length === 1 ? '' : 's'} this preview would not do
      </p>
      <ul className="text-muted-foreground mt-1.5 space-y-1">
        {shown.map((warning) => (
          <li key={warning} className="wrap-break-word">
            {warning}
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          className="text-muted-foreground mt-1.5 underline underline-offset-2"
          onClick={() => setExpanded(true)}
        >
          Show {hidden} more
        </button>
      )}
    </div>
  );
}
