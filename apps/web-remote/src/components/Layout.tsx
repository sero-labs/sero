/**
 * Layout shell — `TitleBar` over a resizable row over `StatusBar`,
 * matching the desktop shell dimensions.
 *
 * Desktop (≥768px): sidebar (20% default, min 200px, collapsible),
 * chat, optional right panel, and the `w-10` activity rail.
 * Mobile (<768px): the sidebar and right panels are `Sheet` overlays,
 * and the status bar is hidden to save height.
 */

import { useCallback } from 'react';
import { MainSidebar } from './sidebar/MainSidebar';
import { ChatPanel } from './ChatPanel';
import { FileBrowser } from './FileBrowser';
import { FilePreview } from './FilePreview';
import { ArtifactGallery } from './ArtifactGallery';
import { PreviewPanel } from './PreviewPanel';
import { StatusBar } from './StatusBar';
import { TitleBar } from './TitleBar';
import { ActivityRail } from './ActivityRail';
import { AccessBanner } from './AccessBanner';
import { useArtifactStore } from '@/stores/artifacts';
import { useDevServerStore } from '@/stores/dev-servers';
import { useWorkspaceStore } from '@/stores/workspace';
import { useLayoutStore, type RightPanel } from '@/stores/layout';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@sero-ai/ui/components/ui/resizable';
import { useIsMobile } from '@sero-ai/ui/hooks/use-mobile';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@sero-ai/ui/components/ui/sheet';

const PANEL_TITLES: Record<RightPanel, string> = {
  files: 'Files',
  artifacts: 'Artifacts',
  preview: 'Dev Servers',
  changes: 'Changes',
};

export function Layout() {
  const isMobile = useIsMobile();
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen);
  const sidebarSize = useLayoutStore((s) => s.sidebarSize);
  const setSidebarOpen = useLayoutStore((s) => s.setSidebarOpen);
  const setSidebarSize = useLayoutStore((s) => s.setSidebarSize);
  const rightPanel = useLayoutStore((s) => s.rightPanel);
  const closeRightPanel = useLayoutStore((s) => s.closeRightPanel);

  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const hasRunningDevServers = useDevServerStore((s) =>
    s.servers.some(
      (server) =>
        server.status !== 'stopped' &&
        (!activeWorkspaceId || server.workspaceId === activeWorkspaceId),
    ),
  );

  const handleSidebarResize = useCallback(
    (panelSize: { asPercentage: number }) => {
      setSidebarSize(`${panelSize.asPercentage.toFixed(2)}%`);
    },
    [setSidebarSize],
  );

  return (
    <div className="flex h-full flex-col">
      <TitleBar isMobile={isMobile} hasRunningDevServers={hasRunningDevServers} />

      <AccessBanner />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* The panel group renders on mobile too — right panels are
            sheets there — so ChatPanel keeps one position in the tree
            across panel toggles AND the responsive breakpoint. Composer
            drafts must survive both. Numeric sizes are pixels in
            react-resizable-panels v4, so sizes are percentage strings. */}
        <ResizablePanelGroup orientation="horizontal" className="min-w-0 flex-1">
          {!isMobile && sidebarOpen && (
            <>
              <ResizablePanel
                id="sidebar"
                defaultSize={sidebarSize}
                minSize={200}
                onResize={handleSidebarResize}
                className="overflow-hidden"
              >
                <MainSidebar />
              </ResizablePanel>
              <ResizableHandle />
            </>
          )}

          <ResizablePanel id="main" minSize="25%">
            <ChatPanel />
          </ResizablePanel>

          {!isMobile && rightPanel && (
            <>
              <ResizableHandle />
              <ResizablePanel
                id="right"
                defaultSize={rightPanel === 'preview' ? '45%' : '30%'}
                minSize="20%"
                className="overflow-hidden bg-[var(--bg-surface)]"
              >
                <RightPanelContent panel={rightPanel} />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>

        {!isMobile && <ActivityRail hasRunningDevServers={hasRunningDevServers} />}
      </div>

      {!isMobile && <StatusBar />}

      {isMobile && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-72 p-0" showCloseButton={false}>
            <SheetHeader className="sr-only">
              <SheetTitle>Workspaces</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-hidden">
              <MainSidebar onSessionSelect={() => setSidebarOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {isMobile && (
        <Sheet
          open={rightPanel !== null}
          onOpenChange={(open) => {
            if (!open) closeRightPanel();
          }}
        >
          <SheetContent
            side="right"
            className={rightPanel === 'preview' ? 'w-[95vw] p-0' : 'w-80 p-0'}
            showCloseButton={false}
          >
            <SheetHeader className="border-b border-[var(--border-subtle)] px-3 py-2">
              <SheetTitle className="text-base">
                {rightPanel ? PANEL_TITLES[rightPanel] : ''}
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-hidden">
              {rightPanel && <RightPanelContent panel={rightPanel} />}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

function RightPanelContent({ panel }: { panel: RightPanel }) {
  if (panel === 'files') return <FilesPanel />;
  if (panel === 'artifacts') return <ArtifactPanelConnected />;
  if (panel === 'preview') return <PreviewPanel />;
  return null;
}

/** Files panel, split between browser and preview. */
function FilesPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="h-1/3 overflow-hidden border-b border-[var(--border-subtle)]">
        <FileBrowser />
      </div>
      <div className="flex-1 overflow-hidden">
        <FilePreview />
      </div>
    </div>
  );
}

/** Artifact panel wrapper, connects ArtifactGallery to the store. */
function ArtifactPanelConnected() {
  const artifacts = useArtifactStore((s) => s.artifacts);
  const loadArtifactData = useArtifactStore((s) => s.loadArtifactData);

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <ArtifactGallery artifacts={artifacts} onLoadArtifact={loadArtifactData} />
      </div>
    </div>
  );
}
