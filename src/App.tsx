import { useCallback, useEffect, useRef } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { TitleBar } from '@/components/layout/TitleBar';
import { MainSidebar } from '@/components/layout/MainSidebar';
import { StatusBar } from '@/components/layout/StatusBar';
import { ChatPanel } from '@/components/layout/ChatPanel';
import { CodingWorkspace } from '@/components/apps/coding/CodingWorkspace';
import { useAppStore } from '@/stores/app';
import { useSessionAgent } from '@/hooks/useSessionAgent';

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
  const isMainSidebarProgrammaticRef = useRef(false);
  const isChatPanelProgrammaticRef = useRef(false);
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
  const chatPanelCollapsedSize = Math.max(
    0,
    CHAT_PANEL_MIN_WIDTH - COLLAPSE_PULL_PAST_MIN * 2,
  );

  // Bridge: session selection → agent lifecycle
  useSessionAgent();

  const handleMainSidebarResize = useCallback(
    ({ inPixels, asPercentage }: { inPixels: number; asPercentage: number }) => {
      if (isMainSidebarProgrammaticRef.current) return;

      if (inPixels <= mainSidebarCollapsedSize + 1) {
        setMainSidebarOpen(false);
        return;
      }

      mainSidebarLastExpandedPctRef.current = asPercentage;

      if (!mainSidebarOpen && inPixels >= MAIN_SIDEBAR_MIN_WIDTH) {
        setMainSidebarOpen(true);
      }
    },
    [
      mainSidebarCollapsedSize,
      setMainSidebarOpen,
      MAIN_SIDEBAR_MIN_WIDTH,
      mainSidebarOpen,
    ],
  );

  const handleChatPanelResize = useCallback(
    ({ inPixels, asPercentage }: { inPixels: number; asPercentage: number }) => {
      if (isChatPanelProgrammaticRef.current) return;

      if (inPixels <= chatPanelCollapsedSize + 1) {
        setChatPanelOpen(false);
        return;
      }

      chatPanelLastExpandedPctRef.current = asPercentage;

      if (!chatPanelOpen && inPixels >= CHAT_PANEL_MIN_WIDTH) {
        setChatPanelOpen(true);
      }
    },
    [
      chatPanelCollapsedSize,
      setChatPanelOpen,
      CHAT_PANEL_MIN_WIDTH,
      chatPanelOpen,
    ],
  );

  useEffect(() => {
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
  }, [mainSidebarOpen, MAIN_SIDEBAR_DEFAULT_SIZE_PCT]);

  useEffect(() => {
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
  }, [chatPanelOpen, CHAT_PANEL_DEFAULT_SIZE_PCT]);

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
              defaultSize={`${MAIN_SIDEBAR_DEFAULT_SIZE_PCT}%`}
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

            <ResizablePanel id="active-app-panel" minSize={40} className="min-w-0">
              <ActiveApp app={activeApp} />
            </ResizablePanel>

            <ResizableHandle
              disabled={!chatPanelOpen}
              className={!chatPanelOpen ? 'pointer-events-none opacity-0' : undefined}
            />

            <ResizablePanel
              id="chat-panel"
              panelRef={chatPanelRef}
              defaultSize={`${CHAT_PANEL_DEFAULT_SIZE_PCT}%`}
              minSize={CHAT_PANEL_MIN_WIDTH}
              collapsible
              collapsedSize={chatPanelCollapsedSize}
              onResize={handleChatPanelResize}
            >
              {chatPanelOpen ? <ChatPanel /> : null}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        <StatusBar />
      </div>
    </TooltipProvider>
  );
}

/** Renders the currently active app. */
function ActiveApp({ app }: { app: string }) {
  const content =
    app === 'coding' ? (
      <CodingWorkspace />
    ) : (
      <div className="flex h-full items-center justify-center bg-[var(--bg-base)]">
        <span className="text-sm capitalize text-[var(--text-muted)]">
          {app} app — coming soon
        </span>
      </div>
    );

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 overflow-x-auto">
      <div className="flex h-full min-h-0 min-w-[500px] flex-1">{content}</div>
    </div>
  );
}
