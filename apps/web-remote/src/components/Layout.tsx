/**
 * Layout shell — sidebar + chat + panels.
 *
 * Mobile (<768px): sidebar & right panels are Sheet overlays.
 * Header pinned top, input pinned bottom (via ChatPanel), only chat scrolls.
 * Desktop (≥768px): traditional sidebar + chat + right panel columns.
 */

import { useState, useCallback } from 'react';
import seroLogoUrl from '@assets/logo.svg';
import { WorkspacePicker } from './WorkspacePicker';
import { ChatPanel } from './ChatPanel';
import { FileBrowser } from './FileBrowser';
import { FilePreview } from './FilePreview';
import { ArtifactGallery } from './ArtifactGallery';
import { PreviewPanel } from './PreviewPanel';
import { StatusBar } from './StatusBar';
import { AccessBanner } from './AccessBanner';
import { useArtifactStore } from '@/stores/artifacts';
import { useDevServerStore } from '@/stores/dev-servers';
import { useWorkspaceStore } from '@/stores/workspace';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import { useIsMobile } from '@sero-ai/ui/hooks/use-mobile';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@sero-ai/ui/components/ui/sheet';
import {
  PanelLeftClose,
  PanelLeftOpen,
  FolderTree,
  Image as ImageIcon,
  Menu,
  Monitor,
} from 'lucide-react';

type RightPanel = 'files' | 'artifacts' | 'preview' | null;

export function Layout() {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined'
      ? !window.matchMedia('(max-width: 767px)').matches
      : true,
  );
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const hasRunningDevServers = useDevServerStore((s) =>
    s.servers.some(
      (server) =>
        server.status !== 'stopped' &&
        (!activeWorkspaceId || server.workspaceId === activeWorkspaceId),
    ),
  );

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);

  const toggleRightPanel = useCallback(
    (panel: 'files' | 'artifacts' | 'preview') => {
      setRightPanel((current) => (current === panel ? null : panel));
    },
    [],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Title bar — always pinned at top */}
      <header className="h-11 px-3 bg-card border-b border-border flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-2">
          <img
            src={seroLogoUrl}
            alt="Sero"
            className="h-5 w-auto invert"
          />
          <Button
            onClick={toggleSidebar}
            variant="ghost"
            size="icon-xs"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {isMobile ? (
              <Menu className="size-4" />
            ) : sidebarOpen ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeftOpen className="size-4" />
            )}
          </Button>
        </div>

        <div className="flex items-center gap-1">
          <Button
            onClick={() => toggleRightPanel('files')}
            variant={rightPanel === 'files' ? 'secondary' : 'ghost'}
            size="icon-xs"
            title="File Browser"
          >
            <FolderTree className="size-4" />
          </Button>
          <Button
            onClick={() => toggleRightPanel('artifacts')}
            variant={rightPanel === 'artifacts' ? 'secondary' : 'ghost'}
            size="icon-xs"
            title="Artifacts"
          >
            <ImageIcon className="size-4" />
          </Button>
          <Button
            onClick={() => toggleRightPanel('preview')}
            variant={rightPanel === 'preview' ? 'secondary' : 'ghost'}
            size="icon-xs"
            title="Dev Server Preview"
            className={cn(
              hasRunningDevServers &&
                'text-emerald-500 hover:text-emerald-400 data-[state=open]:text-emerald-400',
            )}
          >
            <Monitor className="size-4" />
          </Button>
        </div>
      </header>

      <AccessBanner />

      {/* Main content row */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Desktop sidebar — inline panel */}
        {!isMobile && sidebarOpen && (
          <div className="w-56 border-r border-border bg-card shrink-0 overflow-hidden">
            <WorkspacePicker />
          </div>
        )}

        {/* Chat panel — fills remaining space */}
        <div className="flex-1 min-w-0">
          <ChatPanel />
        </div>

        {/* Desktop right panel — inline panel */}
        {!isMobile && rightPanel && (
          <div
            className={`${rightPanel === 'preview' ? 'w-[28rem]' : 'w-80'} border-l border-border bg-card shrink-0 overflow-hidden`}
          >
            {rightPanel === 'files' && <FilesPanel />}
            {rightPanel === 'artifacts' && <ArtifactPanelConnected />}
            {rightPanel === 'preview' && <PreviewPanel />}
          </div>
        )}
      </div>

      {/* Status bar — hidden on mobile to save space */}
      {!isMobile && <StatusBar />}

      {/* Mobile sidebar — Sheet overlay from left */}
      {isMobile && (
        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
          <SheetContent side="left" className="w-72 p-0" showCloseButton={false}>
            <SheetHeader className="px-3 py-2 border-b border-border">
              <SheetTitle className="text-sm">Workspaces</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-hidden">
              <WorkspacePicker onSessionSelect={() => setSidebarOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Mobile right panel — Sheet overlay from right */}
      {isMobile && (
        <Sheet
          open={rightPanel !== null}
          onOpenChange={(open) => { if (!open) setRightPanel(null); }}
        >
          <SheetContent
            side="right"
            className={rightPanel === 'preview' ? 'w-[95vw] p-0' : 'w-80 p-0'}
            showCloseButton={false}
          >
            <SheetHeader className="px-3 py-2 border-b border-border">
              <SheetTitle className="text-sm">
                {rightPanel === 'files'
                  ? 'Files'
                  : rightPanel === 'artifacts'
                    ? 'Artifacts'
                    : 'Dev Servers'}
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-hidden">
              {rightPanel === 'files' && <FilesPanel />}
              {rightPanel === 'artifacts' && <ArtifactPanelConnected />}
              {rightPanel === 'preview' && <PreviewPanel />}
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}

/** Files panel — split between browser and preview. */
function FilesPanel() {
  return (
    <div className="flex flex-col h-full">
      <div className="h-1/3 border-b border-border overflow-hidden">
        <FileBrowser />
      </div>
      <div className="flex-1 overflow-hidden">
        <FilePreview />
      </div>
    </div>
  );
}

/** Artifact panel wrapper — connects ArtifactGallery to the store. */
function ArtifactPanelConnected() {
  const artifacts = useArtifactStore((s) => s.artifacts);
  const loadArtifactData = useArtifactStore((s) => s.loadArtifactData);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <ArtifactGallery
          artifacts={artifacts}
          onLoadArtifact={loadArtifactData}
        />
      </div>
    </div>
  );
}
