/**
 * The isolated preview.
 *
 * The document is loaded from a blob URL into an `allow-scripts`-only iframe,
 * so the frame has an opaque origin: no access to the Sero renderer, its
 * state, cookies or storage. The document's own CSP blocks network, workers
 * and framing. The only host-to-frame message is a declared tweak id with a
 * schema-valid value.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  BLOCKED_CAPABILITY_LABELS,
  PREVIEW_CHANNEL,
  isPreviewFrameMessage,
  type PreviewHostMessage,
} from '../../shared/preview-protocol';
import type { TweakValue } from '../../shared/tweak-types';

export interface PreviewFrameProps {
  html: string | null;
  values: Record<string, TweakValue>;
  viewport: 'desktop' | 'tablet' | 'mobile';
  title: string;
}

const VIEWPORT_WIDTHS: Record<PreviewFrameProps['viewport'], string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
};

export function PreviewFrame({ html, values, viewport, title }: PreviewFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    setReady(false);
    setWarnings([]);
    if (!html) {
      setBlobUrl(null);
      return;
    }
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [html]);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.source !== frameRef.current?.contentWindow) return;
      if (!isPreviewFrameMessage(event.data)) return;

      if (event.data.type === 'ready') {
        setReady(true);
        return;
      }
      const detail = event.data.type === 'blocked'
        ? `${BLOCKED_CAPABILITY_LABELS[event.data.capability]}: ${event.data.detail}`
        : event.data.type === 'rejected'
          ? `Rejected tweak ${event.data.id}: ${event.data.reason}`
          : event.data.message;
      setWarnings((current) => (current.includes(detail) ? current : [...current, detail].slice(-6)));
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Push the effective values once the frame reports it is ready, and on every
  // change afterwards. Only ids and values cross the boundary.
  useEffect(() => {
    if (!ready) return;
    const frame = frameRef.current?.contentWindow;
    if (!frame) return;
    for (const [id, value] of Object.entries(values)) {
      const message: PreviewHostMessage = { channel: PREVIEW_CHANNEL, type: 'tweak-value', id, value };
      frame.postMessage(message, '*');
    }
  }, [ready, values]);

  const width = useMemo(() => VIEWPORT_WIDTHS[viewport], [viewport]);

  if (!blobUrl) {
    return (
      <div className="dl-preview-frame dl-preview-frame--loading" role="status">
        <p>No runnable preview yet.</p>
      </div>
    );
  }

  return (
    <div className="dl-preview-stack">
      <div className="dl-preview-frame" style={{ width, marginInline: 'auto' }}>
        <iframe
          className="dl-preview-frame__frame"
          ref={frameRef}
          referrerPolicy="no-referrer"
          sandbox="allow-scripts"
          src={blobUrl}
          title={title}
        />
      </div>

      {warnings.length > 0 ? (
        <div className="dl-inline-notice dl-inline-notice--warning" role="status">
          <AlertTriangle aria-hidden="true" size={15} />
          <div>
            <strong>{warnings.length} restricted capabilities blocked</strong>
            <ul>
              {warnings.map((warning) => <li key={warning}>{warning}</li>)}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
