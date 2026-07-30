import { AlertTriangle } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  PREVIEW_MESSAGE_SOURCE,
  isPreviewMessage,
  type PreviewMessage,
} from '../../../shared/preview-message';
import { decidePreviewLoad } from '../../lib/preview-navigation';
import { designFontAssets } from '../../lib/design-fonts';
import { useElementSize } from '../../hooks/useElementSize';
import { usePreviewDocument, type PreviewTarget } from '../../hooks/usePreviewDocument';
import { PreviewControls, VIEWPORTS, type Viewport } from './PreviewControls';
import { DesignLoadingState } from './DesignLoadingState';

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

/** How long the first load is given to hear the frame announce itself. */
const ANNOUNCE_GRACE_MS = 750;

function sendFontAssets(
  target: Window,
  fontStack: string,
  sent: Set<string>,
): void {
  void designFontAssets(fontStack)
    .then((faces) => {
      for (const face of faces) {
        if (sent.has(face.id)) continue;
        sent.add(face.id);
        const bytes = face.bytes.slice(0);
        target.postMessage(
          {
            source: PREVIEW_MESSAGE_SOURCE,
            kind: 'font',
            fontStack,
            faceId: face.id,
            bytes,
          },
          '*',
          [bytes],
        );
      }
    })
    .catch(() => undefined);
}

export interface PreviewFrameProps {
  target: PreviewTarget | null;
  /** Recorded at build time — refused imports, stripped remote references. */
  buildWarnings: string[];
  title: string;
  /**
   * Effective tweak values, keyed by custom property (spec §6.5). Sent into the
   * frame as plain values — never CSS — and only ever for properties this
   * revision's own manifest declared, which the document itself enforces.
   */
  tweakValues?: Record<string, string>;
  /** The inspector is hidden; the toggle for it lives with the other controls. */
  focused?: boolean;
  onFocus?: () => void;
  /** Present while this variant is generating or revising. */
  generationMessage?: string;
  /** The visible page area used for a bounded Gallery capture. */
  onCaptureTarget?: (element: HTMLDivElement | null) => void;
  /** True after the frame announced itself and had a short paint settle. */
  onCaptureReady?: (ready: boolean) => void;
}

export function PreviewFrame({
  target,
  buildWarnings,
  title,
  tweakValues,
  focused,
  onFocus,
  generationMessage,
  onCaptureTarget,
  onCaptureReady,
}: PreviewFrameProps) {
  const { url, error, loading } = usePreviewDocument(target);
  const [runtimeMessages, setRuntimeMessages] = useState<PreviewMessage[]>([]);
  const [viewport, setViewport] = useState<Viewport>(VIEWPORTS[0] as Viewport);
  // Reloading is remounting: the frame has an opaque origin, so nothing outside
  // it can reach in and refresh it.
  const [reloads, setReloads] = useState(0);
  const pane = useElementSize<HTMLDivElement>();
  const attachPane = useCallback((element: HTMLDivElement | null) => {
    pane.ref.current = element;
    onCaptureTarget?.(element);
  }, [onCaptureTarget, pane.ref]);
  const frame = useRef<HTMLIFrameElement | null>(null);
  const captureReady = useRef(onCaptureReady);
  useEffect(() => {
    captureReady.current = onCaptureReady;
  }, [onCaptureReady]);
  // Counted rather than flagged: the first load is the document being put there,
  // and any load after it is the page navigating itself somewhere else.
  const loads = useRef(0);
  // Set by the harness's `ready` report. A first load without one is a document
  // this runtime did not build — see `decidePreviewLoad`.
  const announced = useRef(false);
  const blanked = useRef(false);
  const graceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Reset when the element itself is created, not from an effect: `key={url}`
   * mounts a fresh iframe whose first load can land before an effect has run, and
   * a reset afterwards would read that load as a navigation.
   *
   * Stable, and deliberately so. A callback rebuilt each render makes React
   * detach the old one with `null` and reattach the same element, so any ordinary
   * re-render — a warning arriving, the parent updating — would zero the counter
   * and the next load would look like the expected first one. The null guard
   * covers the detach that React 19's StrictMode adds on top.
   */
  const attachFrame = useCallback((element: HTMLIFrameElement | null) => {
    if (element !== null && element !== frame.current) {
      loads.current = 0;
      announced.current = false;
      blanked.current = false;
      // A fresh document is back at its own defaults, so nothing has been sent
      // to it yet — whatever the last one was holding does not carry over.
      applied.current = {};
      // Replace rather than clear: an asset read for the old frame may still be
      // in flight, and it must not mark a face as sent in the new frame's set.
      sentFonts.current = new Set<string>();
      captureReady.current?.(false);
    }
    frame.current = element;
  }, []);

  /**
   * What the document has already been told, so a drag sends one value per
   * change rather than the whole manifest per frame.
   */
  const applied = useRef<Record<string, string>>({});
  const sentFonts = useRef(new Set<string>());

  const sendTweaks = useCallback((values: Record<string, string>) => {
    const target = frame.current?.contentWindow;
    if (!target || !announced.current) return;
    for (const [cssVariable, value] of Object.entries(values)) {
      if (applied.current[cssVariable] === value) continue;
      applied.current[cssVariable] = value;
      // `*` rather than an origin: the frame is sandboxed without
      // `allow-same-origin`, so its origin is opaque and matches nothing. The
      // frame checks the sender, the message shape and its own manifest, which
      // is where the guarantee actually lives.
      target.postMessage(
        { source: PREVIEW_MESSAGE_SOURCE, kind: 'tweak', cssVariable, value },
        '*',
      );
      if (cssVariable === '--font-family' || cssVariable === '--body-font') {
        sendFontAssets(target, value, sentFonts.current);
      }
    }
  }, []);

  const values = tweakValues ?? {};
  const tweakSignature = JSON.stringify(values);
  // Held in a ref for the `ready` handler, which fires from the frame's own
  // timeline rather than from a render. Written in an effect rather than during
  // render: React may replay or discard a render, and a value written from one
  // that never committed would be sent into the page.
  const valuesRef = useRef(values);
  useEffect(() => {
    valuesRef.current = values;
  }, [tweakSignature, values]);

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
    const onMessage = (event: MessageEvent) => {
      // Bound to this frame's own window. Anything else that can post into this
      // renderer could otherwise fabricate a warning — or, worse, suppress one
      // by claiming a capability was already reported.
      if (event.source !== frame.current?.contentWindow) return;
      if (!isPreviewMessage(event.data)) return;
      if (event.data.kind === 'ready') {
        announced.current = true;
        // The values are applied on top of a freshly loaded document, so a
        // reload — or coming back to a variant edited earlier — restores exactly
        // what was on screen rather than the design's own defaults.
        sendTweaks(valuesRef.current);
        if (captureTimer.current !== null) clearTimeout(captureTimer.current);
        captureTimer.current = setTimeout(() => captureReady.current?.(true), 250);
        return;
      }
      report(event.data);
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      if (graceTimer.current !== null) clearTimeout(graceTimer.current);
      if (captureTimer.current !== null) clearTimeout(captureTimer.current);
    };
    // A reload replaces the document, so what the old one reported no longer
    // describes what is on screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, reloads, sendTweaks]);

  // A control moving is a change to a live document, which is an imperative
  // handle rather than something React can render — so it goes out from here.
  useEffect(() => {
    sendTweaks(values);
    // The signature changes exactly when a value does; the object it describes
    // is rebuilt on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tweakSignature, sendTweaks]);

  /**
   * The backstop for the one escape in-page code cannot block: `window.location`
   * is [Unforgeable], so a page can always replace itself. Noticing is all the
   * surface can do — the load has already committed by the time this runs — and
   * `decidePreviewLoad` holds the rule about what to do with that.
   *
   * The first load is judged a beat later, not immediately. Our document
   * announces itself from the harness at `DOMContentLoaded`, which is before the
   * frame fires `load`, but both arrive as separate tasks; the grace period is
   * there so ordinary scheduling is never read as an escape.
   */
  const onLoad = () => {
    loads.current += 1;
    const count = loads.current;
    if (count > 1) {
      settleLoad(count);
      return;
    }
    if (graceTimer.current !== null) clearTimeout(graceTimer.current);
    graceTimer.current = setTimeout(() => settleLoad(count), ANNOUNCE_GRACE_MS);
  };

  const settleLoad = (count: number) => {
    if (blanked.current) return;
    const outcome = decidePreviewLoad({ loadCount: count, announced: announced.current });
    if (outcome.action !== 'blank') return;
    // `about:blank` fires its own load, and the emptied frame never announces
    // itself either — without this the same escape is reported twice.
    blanked.current = true;
    report({
      source: PREVIEW_MESSAGE_SOURCE,
      kind: 'blocked',
      capability: 'navigation',
      detail: outcome.reason,
    });
    if (frame.current) frame.current.src = 'about:blank';
  };

  const warnings = [
    ...buildWarnings,
    ...runtimeMessages.map((message) =>
      message.kind === 'blocked'
        ? `Blocked ${message.capability}${message.detail === '' ? '' : ` — ${message.detail}`}`
        : `Script error — ${message.detail}`,
    ),
  ];

  // Scaled down to fit, never up: a 390-pixel page blown up to fill a wide pane
  // would be a picture of a phone, not the page at that width.
  const scale =
    viewport.width === undefined || pane.width === 0
      ? 1
      : Math.min(1, pane.width / viewport.width);

  const frameElement =
    url === null ? null : (
      <iframe
        key={`${url}#${reloads}`}
        ref={attachFrame}
        src={url}
        onLoad={onLoad}
        title={title}
        // No `allow-same-origin`: with it the frame would share this
        // document's origin and the whole boundary would be decorative.
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        className="size-full border-0 bg-white"
      />
    );

  return (
    // `min-w-0`: without it the pane cannot shrink below whatever the page
    // inside it is, and a wide design pushes the detail panel off screen.
    <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
      <div className="border-border flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border">
        <div ref={attachPane} className="bg-muted/30 relative flex min-h-0 flex-1 justify-center">
          {frameElement === null ? (
            <p className="text-muted-foreground flex h-full items-center text-sm">
              {loading ? 'Loading the preview…' : (error ?? 'Nothing to preview yet.')}
            </p>
          ) : viewport.width === undefined ? (
            frameElement
          ) : (
            <div
              className="shrink-0 origin-top"
              style={{
                width: viewport.width,
                // The scaled element keeps its unscaled size in the layout, so
                // the height is divided back out to fill the pane exactly.
                height: pane.height === 0 ? '100%' : pane.height / scale,
                transform: `scale(${scale})`,
              }}
            >
              {frameElement}
            </div>
          )}
          {generationMessage !== undefined && (
            <DesignLoadingState message={generationMessage} />
          )}
        </div>

        <PreviewControls
          viewport={viewport}
          scale={scale}
          paneWidth={pane.width}
          {...(focused === undefined ? {} : { focused })}
          onViewport={setViewport}
          onReload={() => setReloads((count) => count + 1)}
          {...(onFocus === undefined ? {} : { onFocus })}
        />
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
