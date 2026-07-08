/**
 * BrowserPanel, host for the in-app web browser.
 *
 * The WebContents themselves live in the main process as WebContentsView
 * children of the window. This component only:
 *   1. Renders chrome (tab strip + toolbar).
 *   2. Reserves a rectangle via a placeholder `<div>` and reports its bounds
 *      to the main process so the active view is positioned over it.
 *   3. Subscribes to main → renderer events to keep the store in sync.
 *   4. Calls `hideAll` on unmount so views don't bleed onto other panels.
 *
 * Tabs are scoped to the active workspace so cookies/logins don't leak
 * between projects.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Globe } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { BookmarksBar } from './BookmarksBar';
import { BrowserTabs } from './BrowserTabs';
import { BrowserToolbar } from './BrowserToolbar';
import { ScreenshotOverlay } from './ScreenshotOverlay';
import {
  useActiveBrowserTabId,
  useBrowserStore,
  useWorkspaceBrowserTabs,
} from '@/stores/browser';
import { useZoomStore } from '@/stores/zoom';
import { useBrowserShortcuts } from '@/hooks/useBrowserShortcuts';
import { useAppStore } from '@/stores/app';
import { useComposerAttachmentQueue } from '@/stores/composer-attachments';
import { useLightbox } from '@/components/layout/ImageLightbox';

interface BrowserPanelProps {
  workspaceId: string;
}

const RENDERER_OVERLAY_SELECTOR = [
  '[data-slot="dialog-content"]',
  '[data-slot="alert-dialog-content"]',
  '[data-slot="sheet-content"]',
  '[data-slot="drawer-content"]',
  '[data-slot="popover-content"]',
  '[data-slot="dropdown-menu-content"]',
  '[data-slot="dropdown-menu-sub-content"]',
  '[data-slot="context-menu-content"]',
  '[data-slot="context-menu-sub-content"]',
  '[data-slot="select-content"]',
  '[data-slot="combobox-content"]',
  '[data-slot="menubar-content"]',
  '[data-slot="menubar-sub-content"]',
].join(',');

function hasVisibleRendererOverlay(): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>(RENDERER_OVERLAY_SELECTOR)).some((el) => {
    if (el.dataset.browserOverlay === 'ignore') return false;
    if (el.dataset.state === 'closed') return false;
    return el.getClientRects().length > 0;
  });
}

export function BrowserPanel({ workspaceId }: BrowserPanelProps) {
  const tabs = useWorkspaceBrowserTabs(workspaceId);
  const activeTabId = useActiveBrowserTabId(workspaceId);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;
  const ensureViewsOpen = useBrowserStore((s) => s.ensureViewsOpen);
  const applyEvent = useBrowserStore((s) => s.applyEvent);
  const createTab = useBrowserStore((s) => s.createTab);
  const navigate = useBrowserStore((s) => s.navigate);
  const goBack = useBrowserStore((s) => s.goBack);
  const goForward = useBrowserStore((s) => s.goForward);
  const reload = useBrowserStore((s) => s.reload);
  const stop = useBrowserStore((s) => s.stop);
  const sharePageWithChat = useBrowserStore((s) => s.sharePageWithChat);
  const lightboxOpen = useLightbox((s) => s.open);

  const viewportRef = useRef<HTMLDivElement | null>(null);
  const activeTabRef = useRef(activeTab);
  const rendererOverlayRef = useRef<{ open: boolean; pngBase64: string | null }>({
    open: false,
    pngBase64: null,
  });
  const overlayCaptureInFlightRef = useRef(false);

  // Capture mode: we fetch a full-page PNG, hide the native view, and let
  // the user draw a rect over a renderer-side image. On confirm, the
  // cropped PNG is pushed into the composer attachment queue.
  const [capture, setCapture] = useState<{
    pngBase64: string;
    viewRect: { x: number; y: number; width: number; height: number };
  } | null>(null);
  const [rendererOverlay, setRendererOverlay] = useState<{ open: boolean; pngBase64: string | null }>({
    open: false,
    pngBase64: null,
  });

  useBrowserShortcuts(workspaceId);

  activeTabRef.current = activeTab;
  rendererOverlayRef.current = rendererOverlay;

  // Ensure all persisted tabs have WebContentsViews in main when the panel
  // mounts or the active workspace changes, and snap the active view to
  // the workspace's last active tab.
  useEffect(() => {
    ensureViewsOpen(workspaceId);
    return () => {
      void window.sero.browser.hideAll();
    };
  }, [workspaceId, ensureViewsOpen]);

  // Subscribe once to main-process events.
  useEffect(() => {
    const off = window.sero.browser.onEvent((event) => {
      applyEvent(event);
    });
    return off;
  }, [applyEvent]);

  // Keep native WebContentsView activation aligned with renderer state,
  // including tabs created by the host/CLI while this panel is mounted.
  useEffect(() => {
    void window.sero.browser.setActive(activeTabId, workspaceId);
  }, [activeTabId, workspaceId]);

  // WebContentsView is a native layer above the renderer, so Radix portals
  // (dialogs, popovers, menus) cannot z-index over it. When one opens, capture
  // the current browser pixels, park the native view, and render the static
  // snapshot in its place so overlays remain readable without a black void.
  useEffect(() => {
    let disposed = false;

    const closeOverlaySnapshot = () => {
      overlayCaptureInFlightRef.current = false;
      const next = { open: false, pngBase64: null };
      rendererOverlayRef.current = next;
      setRendererOverlay(next);
    };

    const openOverlaySnapshot = () => {
      if (rendererOverlayRef.current.open || overlayCaptureInFlightRef.current) return;
      overlayCaptureInFlightRef.current = true;
      void (async () => {
        const tab = activeTabRef.current;
        const pngBase64 = tab
          ? await window.sero.browser.capturePage(tab.id, tab.workspaceId).catch(() => null)
          : null;
        overlayCaptureInFlightRef.current = false;
        if (disposed || !hasVisibleRendererOverlay()) return;
        const next = { open: true, pngBase64 };
        rendererOverlayRef.current = next;
        setRendererOverlay(next);
      })();
    };

    const update = () => {
      if (hasVisibleRendererOverlay()) {
        openOverlaySnapshot();
      } else if (rendererOverlayRef.current.open || overlayCaptureInFlightRef.current) {
        closeOverlaySnapshot();
      }
    };

    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-state', 'style', 'class'],
    });
    return () => {
      disposed = true;
      observer.disconnect();
    };
  }, []);

  // Track the placeholder element's screen rect and push it to main so the
  // active view stays glued to the visible area. Runs on mount, tab change,
  // and whenever the element resizes (window / sidebar / chat panel toggle).
  // While renderer overlays are open, the native view is intentionally parked
  // off-screen so dialogs, popovers, menus, and lightboxes can sit above it.
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const sync = () => {
      if (capture || lightboxOpen || rendererOverlay.open) {
        void window.sero.browser.hideAll();
        return;
      }
      // Send raw CSS-pixel bounds. The main process converts to DIP once at
      // the boundary (multiplying by the page zoom factor) — see
      // electron/ipc/apps/browser.ts. Multiplying here too would square it.
      const rect = el.getBoundingClientRect();
      const width = Math.max(0, Math.round(rect.width));
      const height = Math.max(0, Math.round(rect.height));
      if (width === 0 || height === 0) return;
      void window.sero.browser.setBounds({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width,
        height,
      });
    };

    sync();
    const observer = new ResizeObserver(sync);
    observer.observe(el);
    window.addEventListener('resize', sync);
    // Page zoom shifts the placeholder's screen rect (the counter-zoomed
    // chrome changes height) and changes the main-process DIP conversion, so
    // re-sync on zoom — without rebuilding the observer on every step.
    const unsubscribeZoom = useZoomStore.subscribe(sync);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
      unsubscribeZoom();
    };
  }, [activeTabId, capture, lightboxOpen, rendererOverlay.open]);

  const startCapture = useCallback(async () => {
    if (!activeTab) return;
    const el = viewportRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pngBase64 = await window.sero.browser.capturePage(activeTab.id, activeTab.workspaceId);
    if (!pngBase64) {
      console.warn('[browser] capturePage returned nothing.');
      return;
    }
    setCapture({
      pngBase64,
      viewRect: {
        x: Math.round(r.left),
        y: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height),
      },
    });
  }, [activeTab]);

  const handleCaptureConfirm = useCallback(
    (blob: Blob) => {
      const file = new File([blob], `tab-${Date.now()}.png`, { type: 'image/png' });
      useComposerAttachmentQueue.getState().push(file);
      if (!useAppStore.getState().chatPanelOpen) {
        useAppStore.getState().setChatPanelOpen(true);
      }
      setCapture(null);
    },
    [],
  );

  // Empty state, no tabs yet in this workspace.
  if (tabs.length === 0 || !activeTab) {
    return (
      <div className="flex size-full flex-col items-center justify-center gap-3 bg-[var(--bg-base)]">
        <Globe className="size-10 text-[var(--text-muted)] opacity-40" />
        <div className="text-sm text-[var(--text-muted)]">No browser tabs open in this workspace</div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => createTab(workspaceId)}
        >
          New tab
        </Button>
      </div>
    );
  }

  return (
    <div className="flex size-full flex-col bg-[var(--bg-base)]">
      <BrowserTabs workspaceId={workspaceId} />
      <BrowserToolbar
        tab={activeTab}
        onNavigate={(url) => navigate(activeTab.id, url)}
        onBack={() => goBack(activeTab.id)}
        onForward={() => goForward(activeTab.id)}
        onReload={() => reload(activeTab.id)}
        onStop={() => stop(activeTab.id)}
        onSharePage={() => { void sharePageWithChat(activeTab.id); }}
        onCaptureArea={() => { void startCapture(); }}
      />
      <BookmarksBar onNavigate={(url) => navigate(activeTab.id, url)} workspaceId={workspaceId} />
      {/*
        Native WebContentsView renders on top of this div at the bounds we
        report. The div itself stays blank, it only exists to reserve space
        and give the ResizeObserver something to track.
      */}
      <div ref={viewportRef} data-testid="browser-viewport" className="relative min-h-0 flex-1 overflow-hidden">
        {rendererOverlay.open && rendererOverlay.pngBase64 ? (
          <img
            src={`data:image/png;base64,${rendererOverlay.pngBase64}`}
            alt=""
            className="pointer-events-none absolute inset-0 size-full object-fill"
            draggable={false}
          />
        ) : null}
      </div>
      {capture && (
        <ScreenshotOverlay
          pngBase64={capture.pngBase64}
          viewRect={capture.viewRect}
          onCapture={handleCaptureConfirm}
          onCancel={() => setCapture(null)}
        />
      )}
    </div>
  );
}
