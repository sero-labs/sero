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
  const chatPanelOpen = useAppStore((s) => s.chatPanelOpen);

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-screen w-screen flex-col overflow-hidden bg-[var(--bg-base)]">
        <TitleBar />

        <div className="flex min-h-0 flex-1">
          <MainSidebar />

          {chatPanelOpen ? (
            /* ── Resizable: active app ↔ chat panel ────────────── */
            <ResizablePanelGroup
              orientation="horizontal"
              style={{ flex: '1 1 0%', minWidth: 0, width: 'auto' }}
            >
              <ResizablePanel defaultSize="70%" minSize="20%">
                <ActiveApp app={activeApp} />
              </ResizablePanel>

              <ResizableHandle />

              <ResizablePanel defaultSize="30%" minSize="300px" maxSize="50%">
                <ChatPanel />
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            /* ── App takes full width when chat is collapsed ───── */
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
  if (app === 'coding') return <CodingWorkspace />;
  return (
    <div className="flex h-full flex-1 items-center justify-center bg-[var(--bg-base)]">
      <span className="text-sm capitalize text-[var(--text-muted)]">
        {app} app — coming soon
      </span>
    </div>
  );
}
