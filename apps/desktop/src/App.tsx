import { useCallback, useEffect, useRef } from 'react';
import { useDebouncedCallback } from '@/hooks/useDebouncedCallback';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import { TooltipProvider } from '@sero-ai/ui/components/ui/tooltip';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@sero-ai/ui/components/ui/resizable';
import { TitleBar } from '@/components/layout/shell/TitleBar';
import { MainSidebar } from '@/components/layout/shell/MainSidebar';
import { StatusBar } from '@/components/layout/shell/StatusBar';
import { ChatPanel } from '@/components/layout/shell/ChatPanel';
import { useAppStore, listenForAppNavigationWorkspace, listenForNewApps } from '@/stores/app';
import { listenForSystemThemeChanges, listenForTitleBarOverlaySync } from '@/stores/theme';
import { listenForZoomCommands } from '@/stores/zoom';
import { useProfileStore, loadProfiles } from '@/stores/profiles';
import { ProfileSetup } from '@/components/profiles/ProfileSetup';
import { OnboardingWizard } from '@/components/profiles/OnboardingWizard';
import { subscribeDevServerEvents } from '@/stores/dev-server';
import { NewAppBanner } from '@/components/layout/shell/NewAppBanner';
import { StorageSecurityBanner } from '@/components/layout/shell/StorageSecurityBanner';
import { useSessionAgent } from '@/hooks/useSessionAgent';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { CommandMenu } from '@/components/layout/shell/CommandMenu';
import { GlobalSearchDialog } from '@/components/layout/search/GlobalSearchDialog';
import { GitHubAuthDialog } from '@/components/layout/auth/github/GitHubAuthDialog';
import { initAppControlBridge } from '@/lib/app-control-bridge';
import { hydrateShellState } from '@/lib/app-startup';
import { ActiveAppPanel } from '@/components/apps/ActiveAppPanel';
import { useAgentStore } from '@/stores/agent';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useUserFeedbackInit } from '@/hooks/useUserFeedbackInit';
import { GlobalQuestionPrompt } from '@/components/layout/shell/GlobalQuestionPrompt';

function persistMainSidebarSize(pct: number): void {
  useAppStore.getState().setMainSidebarSizePct(Math.round(pct * 10) / 10);
}

function persistChatPanelSize(pct: number): void {
  useAppStore.getState().setChatPanelSizePct(Math.round(pct * 10) / 10);
}

/**
 * App shell.
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  TitleBar (⊞ sidebar toggle ... app name ... ⌘K ... ⊟ chat)     │
 * ├──────────┬──────────────────────────────┬─┬─────────────────┤
 * │  Main    │                              │║│                 │
 * │  Sidebar │     Active App               │║│  Chat Panel     │
 * │  (apps   │     (ExplorerWorkspace etc.)   │║│  (global agent) │
 * │  + chats)│                              │║│                 │
 * ├──────────┴──────────────────────────────┴─┴─────────────────┤
 * │  StatusBar                                                   │
 * └─────────────────────────────────────────────────────────────┘
 *
 * Both sidebars (MainSidebar left, ChatPanel right) are collapsible
 * via toggle buttons in the TitleBar. The ChatPanel is global ,
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
  const isMainSidebarProgrammaticRef = useRef(true);
  const isChatPanelProgrammaticRef = useRef(true);

  const MAIN_SIDEBAR_MIN_WIDTH = 200;
  const CHAT_PANEL_MIN_WIDTH = 300;
  const mainSidebarCollapsedSize = 0;
  const chatPanelCollapsedSize = 0;

  const mainSidebarLastExpandedPctRef = useRef(20);
  const chatPanelLastExpandedPctRef = useRef(30);
  const mainSidebarDefaultRef = useRef<string | number>(0);
  const chatPanelDefaultRef = useRef<string | number>(0);
  // Hydrate once, refs capture persisted values on the FIRST render where
  // layoutReady=true, which is the same render that first mounts the panels
  // (because the loading guard returns early until then).
  const layoutHydratedRef = useRef(false);

  const appsReady = useAppStore((s) => s.appsReady);
  const layoutReady = useAppStore((s) => s.layoutReady);
  const profileReady = useProfileStore((s) => s.ready);
  const hasActiveProfile = useProfileStore((s) => s.hasActiveProfile);
  const initAgentEventListener = useAgentStore((s) => s.initEventListener);

  // Bridge: session selection → agent lifecycle
  useSessionAgent();

  // Always-on user-feedback listeners so background-job questions (e.g. an
  // Orchestrator loop's dirty-workspace prompt) are received even when the chat
  // panel is closed. Ref-counted, so per-panel inits stay safe.
  useUserFeedbackInit();

  // Global keyboard shortcuts (⌘B sidebar, ⌘L chat)
  useKeyboardShortcuts();

  // Hydrate refs from store once layout has loaded. Runs during render (not
  // an effect) so refs are set BEFORE the JSX tree mounts the panels.
  if (layoutReady && appsReady && !layoutHydratedRef.current) {
    layoutHydratedRef.current = true;
    const s = useAppStore.getState();
    mainSidebarLastExpandedPctRef.current = s.mainSidebarSizePct;
    chatPanelLastExpandedPctRef.current = s.chatPanelSizePct;
    mainSidebarDefaultRef.current = s.mainSidebarOpen ? `${s.mainSidebarSizePct}%` : 0;
    chatPanelDefaultRef.current = s.chatPanelOpen ? `${s.chatPanelSizePct}%` : 0;
  }

  // Load profiles + hydrate app/workspace state on startup
  useEffect(() => {
    void loadProfiles();
    void hydrateShellState();
    const unsub = listenForNewApps();
    const unsubNavigationWorkspace = listenForAppNavigationWorkspace();
    const unsubTheme = listenForSystemThemeChanges();
    const unsubZoom = listenForZoomCommands();
    const unsubOverlay = listenForTitleBarOverlaySync();
    return () => { unsub(); unsubNavigationWorkspace(); unsubTheme(); unsubZoom(); unsubOverlay(); };
  }, []);

  // Subscribe to dev server events from main process
  useEffect(() => {
    return subscribeDevServerEvents();
  }, []);

  // Initialize app control bridge (window.__appControl) for agent interaction
  useEffect(() => {
    return initAppControlBridge();
  }, []);

  // Keep agent event subscriptions alive even when the ChatPanel is hidden.
  useEffect(() => {
    const unsub = initAgentEventListener();
    return unsub;
  }, [initAgentEventListener]);

  useEffect(() => {
    return window.sero.auth.onEvent((event) => {
      if (event.type !== 'success') return;
      const { agents, fetchModelState } = useAgentStore.getState();
      void Promise.allSettled(
        Object.keys(agents).map(async (sessionId) => {
          await fetchModelState(sessionId);
        }),
      );
    });
  }, []);

  const persistMainSidebarSizeDebounced = useDebouncedCallback(persistMainSidebarSize, 300);
  const persistChatPanelSizeDebounced = useDebouncedCallback(persistChatPanelSize, 300);

  const handleMainSidebarResize = useCallback(
    ({ inPixels, asPercentage }: { inPixels: number; asPercentage: number }) => {
      if (!layoutReady || !appsReady) return;
      if (isMainSidebarProgrammaticRef.current) return;

      if (inPixels <= mainSidebarCollapsedSize + 1) {
        setMainSidebarOpen(false);
        return;
      }

      mainSidebarLastExpandedPctRef.current = asPercentage;
      persistMainSidebarSizeDebounced(asPercentage);
    },
    [appsReady, layoutReady, setMainSidebarOpen, persistMainSidebarSizeDebounced],
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
      persistChatPanelSizeDebounced(asPercentage);
    },
    [appsReady, layoutReady, setChatPanelOpen, persistChatPanelSizeDebounced],
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
        const targetPct = mainSidebarLastExpandedPctRef.current;
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
  }, [mainSidebarOpen, layoutReady, appsReady]);

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
        const targetPct = chatPanelLastExpandedPctRef.current;
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
  }, [chatPanelOpen, layoutReady, appsReady]);

  // Wait for profile + layout hydration + app discovery before rendering.
  // Workspaces load in parallel but don't block, workspace-scoped apps
  // already guard on activeWorkspaceId inside SeroAppMount.
  if (!profileReady || !appsReady || !layoutReady) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[var(--bg-base)]">
        <span className="text-xs text-[var(--text-muted)]">Loading…</span>
      </div>
    );
  }

  // No active profile → show first-run setup screen
  if (!hasActiveProfile) {
    return <ProfileSetup />;
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
              defaultSize={mainSidebarDefaultRef.current}
              minSize={MAIN_SIDEBAR_MIN_WIDTH}
              collapsible
              collapsedSize={mainSidebarCollapsedSize}
              onResize={handleMainSidebarResize}
            >
              {mainSidebarOpen ? (
                <ErrorBoundary region="Sidebar" compact>
                  <MainSidebar />
                </ErrorBoundary>
              ) : null}
            </ResizablePanel>

            <ResizableHandle
              disabled={!mainSidebarOpen}
              className={!mainSidebarOpen ? 'pointer-events-none opacity-0' : undefined}
            />

            <ResizablePanel id="active-app-panel" minSize={40} className="min-w-0 flex flex-col">
              <ErrorBoundary key={activeApp} region="Plugin">
                <ActiveAppPanel app={activeApp} />
              </ErrorBoundary>
            </ResizablePanel>

            <ResizableHandle
              disabled={!chatPanelOpen}
              className={!chatPanelOpen ? 'pointer-events-none opacity-0' : undefined}
            />

            <ResizablePanel
              id="chat-panel"
              panelRef={chatPanelRef}
              defaultSize={chatPanelDefaultRef.current}
              minSize={CHAT_PANEL_MIN_WIDTH}
              collapsible
              collapsedSize={chatPanelCollapsedSize}
              onResize={handleChatPanelResize}
            >
              {chatPanelOpen ? (
                <ErrorBoundary region="Chat" compact>
                  <ChatPanel />
                </ErrorBoundary>
              ) : null}
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>

        <CommandMenu />
        <GlobalSearchDialog />
        <GitHubAuthDialog />
        <NewAppBanner />
        <StorageSecurityBanner />
        <OnboardingWizard />
        <GlobalQuestionPrompt />
        <StatusBar />
      </div>
    </TooltipProvider>
  );
}
