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
  const chatPanelOpen = useAppStore((s) => s.chatPanelOpen);

  // Bridge: session selection → agent lifecycle
  useSessionAgent();

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
                    minSize={200}
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
                    minSize={400}
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
