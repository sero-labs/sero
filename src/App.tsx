import { useCallback } from 'react';
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
    ({ inPixels }: { inPixels: number }) => {
      if (inPixels <= mainSidebarCollapsedSize + 1) {
        setMainSidebarOpen(false);
      }
    },
    [mainSidebarCollapsedSize, setMainSidebarOpen],
  );

  const handleChatPanelResize = useCallback(
    ({ inPixels }: { inPixels: number }) => {
      if (inPixels <= chatPanelCollapsedSize + 1) {
        setChatPanelOpen(false);
      }
    },
    [chatPanelCollapsedSize, setChatPanelOpen],
  );

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-base)]">
        <TitleBar />

        <div className="flex min-h-0 flex-1">
          {mainSidebarOpen || chatPanelOpen ? (
            <ResizablePanelGroup
              orientation="horizontal"
              className="min-w-0 flex-1"
            >
              {mainSidebarOpen && (
                <>
                  <ResizablePanel
                    defaultSize="20%"
                    minSize={MAIN_SIDEBAR_MIN_WIDTH}
                    collapsible
                    collapsedSize={mainSidebarCollapsedSize}
                    onResize={handleMainSidebarResize}
                  >
                    <MainSidebar />
                  </ResizablePanel>
                  <ResizableHandle />
                </>
              )}

              <ResizablePanel minSize={40} className="min-w-0">
                <ActiveApp app={activeApp} />
              </ResizablePanel>

              {chatPanelOpen && (
                <>
                  <ResizableHandle />
                  <ResizablePanel
                    defaultSize="30%"
                    minSize={CHAT_PANEL_MIN_WIDTH}
                    collapsible
                    collapsedSize={chatPanelCollapsedSize}
                    onResize={handleChatPanelResize}
                  >
                    <ChatPanel />
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          ) : (
            <div className="flex min-h-0 min-w-0 flex-1">
              <ActiveApp app={activeApp} />
            </div>
          )}
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
