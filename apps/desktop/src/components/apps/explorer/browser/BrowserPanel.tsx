/**
 * BrowserPanel — host for the in-app web browser.
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

import { useEffect, useLayoutEffect, useRef } from 'react';
import { Globe } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { BookmarksBar } from './BookmarksBar';
import { BrowserTabs } from './BrowserTabs';
import { BrowserToolbar } from './BrowserToolbar';
import {
  useActiveBrowserTabId,
  useBrowserStore,
  useWorkspaceBrowserTabs,
} from '@/stores/browser';
import { useBrowserShortcuts } from '@/hooks/useBrowserShortcuts';

interface BrowserPanelProps {
  workspaceId: string;
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

  const viewportRef = useRef<HTMLDivElement | null>(null);

  useBrowserShortcuts(workspaceId);

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

  // Track the placeholder element's screen rect and push it to main so the
  // active view stays glued to the visible area. Runs on mount, tab change,
  // and whenever the element resizes (window / sidebar / chat panel toggle).
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const sync = () => {
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
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sync);
    };
  }, [activeTabId]);

  // Empty state — no tabs yet in this workspace.
  if (tabs.length === 0 || !activeTab) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[var(--bg-base)]">
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
    <div className="flex h-full w-full flex-col bg-[var(--bg-base)]">
      <BrowserTabs workspaceId={workspaceId} />
      <BrowserToolbar
        tab={activeTab}
        onNavigate={(url) => navigate(activeTab.id, url)}
        onBack={() => goBack(activeTab.id)}
        onForward={() => goForward(activeTab.id)}
        onReload={() => reload(activeTab.id)}
        onStop={() => stop(activeTab.id)}
      />
      <BookmarksBar onNavigate={(url) => navigate(activeTab.id, url)} workspaceId={workspaceId} />
      {/*
        Native WebContentsView renders on top of this div at the bounds we
        report. The div itself stays blank — it only exists to reserve space
        and give the ResizeObserver something to track.
      */}
      <div ref={viewportRef} className="min-h-0 flex-1" />
    </div>
  );
}
