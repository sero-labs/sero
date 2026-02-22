import { useCallback, useEffect, useRef } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { TooltipProvider } from '@sero/ui/components/ui/tooltip';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@sero/ui/components/ui/resizable';
import { TitleBar } from '@/components/layout/TitleBar';
import { MainSidebar } from '@/components/layout/MainSidebar';
import { StatusBar } from '@/components/layout/StatusBar';
import { ChatPanel } from '@/components/layout/ChatPanel';
import { CodingWorkspace } from '@/components/apps/coding/CodingWorkspace';
import { SeroAppMount } from '@/components/apps/SeroAppMount';
import { useAppStore, discoverAndRegisterApps, listenForNewApps, loadLayout } from '@/stores/app';
import { subscribeDevServerEvents } from '@/stores/dev-server';
import { NewAppBanner } from '@/components/layout/NewAppBanner';
import { useSessionAgent } from '@/hooks/useSessionAgent';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';

/**
 * App shell.
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  TitleBar (⊞ sidebar toggle … app name … ⌘K … ⊟ chat)     │
 * ├──────────┬──────────────────────────────┬─┬─────────────────┤
 * │  Main    │                              │║│                 │
 * │  Sidebar │     Active App               │║│  Chat Panel     │
 * │  (apps   │     (CodingWorkspace etc.)   │║│  (global agent) │
 * │  + chats)│                              │║│                 │
 * ├──────────┴──────────────────────────────┴─┴─────────────────┤
 * │  StatusBar                                                   │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Both sidebars (MainSidebar left, ChatPanel right) are collapsible
 * via toggle buttons in the TitleBar. The ChatPanel is global —
 * it persists across all apps.
 */
export function App() {
  const activeApp = useAppStore((s) => s.activeApp);
  const mainSidebarOpen = useAppStore((s) => s.mainSidebarOpen);
  const setMainSidebarOpen = useAppStore((s) => s.setMainSidebarOpen);
  const chatPanelOpen = useAppStore((s) => s.chatPanelOpen);
  const setChatPanelOpen = useAppStore((s) => s.setChatPanelOpen);
  const mainSidebarPanelRef = useRef<PanelImperativeHandle | null>(null);
  const chatPanelRef = useRef<PanelImperativeHandle | null>(null);
  // Start true — blocks onResize events fired during initial render (before
  // the sync effects run). Without this, the handler sees the panel at its
  // defaultSize, detects !open && inPixels >= min, and immediately re-opens.
  const isMainSidebarProgrammaticRef = useRef(true);
  const isChatPanelProgrammaticRef = useRef(true);
  const MAIN_SIDEBAR_DEFAULT_SIZE_PCT = 20;
  const CHAT_PANEL_DEFAULT_SIZE_PCT = 30;
  const mainSidebarLastExpandedPctRef = useRef(MAIN_SIDEBAR_DEFAULT_SIZE_PCT);
  const chatPanelLastExpandedPctRef = useRef(CHAT_PANEL_DEFAULT_SIZE_PCT);

  const MAIN_SIDEBAR_MIN_WIDTH = 200;
  const CHAT_PANEL_MIN_WIDTH = 300;
  const COLLAPSE_PULL_PAST_MIN = 100;

  const mainSidebarCollapsedSize = Math.max(
    0,
    MAIN_SIDEBAR_MIN_WIDTH - COLLAPSE_PULL_PAST_MIN * 2,
  );
  const chatPanelCollapsedSize = 0;

  const appsReady = useAppStore((s) => s.appsReady);
  const layoutReady = useAppStore((s) => s.layoutReady);

  // Bridge: session selection → agent lifecycle
  useSessionAgent();

  // Global keyboard shortcuts (⌘B sidebar, ⌘L chat)
  useKeyboardShortcuts();

  // Load layout + discover apps on startup
  useEffect(() => {
    loadLayout();
    discoverAndRegisterApps();
    return listenForNewApps();
  }, []);

  // Subscribe to dev server events from main process
  useEffect(() => {
    return subscribeDevServerEvents();
  }, []);

  const handleMainSidebarResize = useCallback(
    ({ inPixels, asPercentage }: { inPixels: number; asPercentage: number }) => {
      if (!layoutReady || !appsReady) return;
      if (isMainSidebarProgrammaticRef.current) return;

      if (inPixels <= mainSidebarCollapsedSize + 1) {
        setMainSidebarOpen(false);
        return;
      }

      mainSidebarLastExpandedPctRef.current = asPercentage;
    },
    [
      appsReady,
      mainSidebarCollapsedSize,
      layoutReady,
      setMainSidebarOpen,
    ],
  );

  const handleChatPanelResize = useCallback(
    ({ inPixels, asPercentage }: { inPixels: number; asPercentage: number }) => {
      if (!layoutReady || !appsReady) return;
      if (isChatPanelProgrammaticRef.current) return;

      if (inPixels <= chatPanelCollapsedSize + 1) {
        setChatPanelOpen(false);
        return;
      }

      chatPanelLastExpandedPctRef.current = asPercentage;
    },
    [
      appsReady,
      chatPanelCollapsedSize,
      layoutReady,
      setChatPanelOpen,
    ],
  );

  // ── Panel sync effects ──────────────────────────────────────
  // Guarded on layoutReady so they don't run during the "Loading…"
  // phase. Without this, the effect fires with default store values,
  // its RAF sets the programmatic ref to false, and when panels mount
  // for the first time their onResize overrides the loaded state.

  useEffect(() => {
    if (!layoutReady || !appsReady) return;

    let rafId: number | null = null;
    let rafId2: number | null = null;
    isMainSidebarProgrammaticRef.current = true;
    if (!mainSidebarOpen) {
      mainSidebarPanelRef.current?.collapse();
      rafId = window.requestAnimationFrame(() => {
        isMainSidebarProgrammaticRef.current = false;
      });
    } else {
      rafId = window.requestAnimationFrame(() => {
        const targetPct = Math.max(
          MAIN_SIDEBAR_DEFAULT_SIZE_PCT,
          mainSidebarLastExpandedPctRef.current,
        );
        mainSidebarPanelRef.current?.expand();
        mainSidebarPanelRef.current?.resize(`${targetPct}%`);
        rafId2 = window.requestAnimationFrame(() => {
          isMainSidebarProgrammaticRef.current = false;
        });
      });
    }

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (rafId2 !== null) window.cancelAnimationFrame(rafId2);
      isMainSidebarProgrammaticRef.current = false;
    };
  }, [mainSidebarOpen, layoutReady, appsReady, MAIN_SIDEBAR_DEFAULT_SIZE_PCT]);

  useEffect(() => {
    if (!layoutReady || !appsReady) return;

    let rafId: number | null = null;
    let rafId2: number | null = null;
    isChatPanelProgrammaticRef.current = true;
    if (!chatPanelOpen) {
      chatPanelRef.current?.collapse();
      rafId = window.requestAnimationFrame(() => {
        isChatPanelProgrammaticRef.current = false;
      });
    } else {
      rafId = window.requestAnimationFrame(() => {
        const targetPct = Math.max(
          CHAT_PANEL_DEFAULT_SIZE_PCT,
          chatPanelLastExpandedPctRef.current,
        );
        chatPanelRef.current?.expand();
        chatPanelRef.current?.resize(`${targetPct}%`);
        rafId2 = window.requestAnimationFrame(() => {
          isChatPanelProgrammaticRef.current = false;
        });
      });
    }

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (rafId2 !== null) window.cancelAnimationFrame(rafId2);
      isChatPanelProgrammaticRef.current = false;
    };
  }, [chatPanelOpen, layoutReady, appsReady, CHAT_PANEL_DEFAULT_SIZE_PCT]);

  // Wait for layout hydration + app discovery before rendering.
  // Layout must load first so panels render at the correct size (no flash).
  if (!appsReady || !layoutReady) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--bg-base)]">
        <span className="text-xs text-[var(--text-muted)]">Loading…</span>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-base)]">
        <TitleBar />

        <div className="flex min-h-0 flex-1">
          <ResizablePanelGroup
            id="app-shell-panels"
            orientation="horizontal"
            className="min-w-0 flex-1"
          >
            <ResizablePanel
              id="main-sidebar-panel"
              panelRef={mainSidebarPanelRef}
              defaultSize={
                mainSidebarOpen ? `${MAIN_SIDEBAR_DEFAULT_SIZE_PCT}%` : mainSidebarCollapsedSize
              }
              minSize={MAIN_SIDEBAR_MIN_WIDTH}
              collapsible
              collapsedSize={mainSidebarCollapsedSize}
              onResize={handleMainSidebarResize}
            >
              {mainSidebarOpen ? <MainSidebar /> : null}
            </ResizablePanel>

            <ResizableHandle
              disabled={!mainSidebarOpen}
              className={!mainSidebarOpen ? 'pointer-events-none opacity-0' : undefined}
            />

            <ResizablePanel id="active-app-panel" minSize={40} className="min-w-0 flex flex-col">
              <ActiveApp app={activeApp} />
            </ResizablePanel>

            <ResizableHandle
              disabled={!chatPanelOpen}
              className={!chatPanelOpen ? 'pointer-events-none opacity-0' : undefined}
            />

            <ResizablePanel
              id="chat-panel"
              panelRef={chatPanelRef}
              defaultSize={chatPanelOpen ? `${CHAT_PANEL_DEFAULT_SIZE_PCT}%` : chatPanelCollapsedSize}
              minSize={CHAT_PANEL_MIN_WIDTH}
              collapsible
              collapsedSize={chatPanelCollapsedSize}
              onResize={handleChatPanelResize}
            >
              {chatPanelOpen ? <ChatPanel /> : null}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        <NewAppBanner />
        <StatusBar />
      </div>
    </TooltipProvider>
  );
}

/** Renders the currently active app — built-in or federated. */
function ActiveApp({ app }: { app: string }) {
  const apps = useAppStore((s) => s.apps);
  const entry = apps.find((a) => a.id === app);

  let content: React.ReactNode;

  if (app === 'coding') {
    content = <CodingWorkspace />;
  } else if (entry?.manifest) {
    // Discovered sero app — mount via module federation
    content = <SeroAppMount manifest={entry.manifest} />;
  } else {
    content = (
      <div className="flex h-full items-center justify-center bg-[var(--bg-base)]">
        <span className="text-sm capitalize text-[var(--text-muted)]">
          {app} app — coming soon
        </span>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 min-w-[500px] flex-1 flex-col overflow-hidden">
      {content}
    </div>
  );
}
