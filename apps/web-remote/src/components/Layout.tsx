/**
 * Layout shell — sidebar + chat + panels.
 *
 * Mobile (<768px): sidebar & right panels are Sheet overlays.
 * Header pinned top, input pinned bottom (via ChatPanel), only chat scrolls.
 * Desktop (≥768px): traditional sidebar + chat + right panel columns.
 */

import { useState, useCallback } from 'react';
import { WorkspacePicker } from './WorkspacePicker';
import { ChatPanel } from './ChatPanel';
import { FileBrowser } from './FileBrowser';
import { FilePreview } from './FilePreview';
import { ArtifactGallery } from './ArtifactGallery';
import { StatusBar } from './StatusBar';
import { useArtifactStore } from '@/stores/artifacts';
import { cn } from '@sero/ui/lib/utils';
import { Button } from '@sero/ui/components/ui/button';
import { useIsMobile } from '@sero/ui/hooks/use-mobile';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@sero/ui/components/ui/sheet';
import {
  PanelLeftClose,
  PanelLeftOpen,
  FolderTree,
  Image as ImageIcon,
  Menu,
} from 'lucide-react';

type RightPanel = 'files' | 'artifacts' | null;

export function Layout() {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);

  const toggleRightPanel = useCallback(
    (panel: 'files' | 'artifacts') => {
      setRightPanel((current) => (current === panel ? null : panel));
    },
    [],
  );

  return (
    <div className="flex flex-col h-full">
      {/* Title bar — always pinned at top */}
      <header className="h-11 px-3 bg-card border-b border-border flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-2">
          <Button
            onClick={toggleSidebar}
            variant="ghost"
            size="icon-xs"
          >
            {isMobile ? (
              <Menu className="size-4" />
            ) : sidebarOpen ? (
              <PanelLeftClose className="size-4" />
            ) : (
              <PanelLeftOpen className="size-4" />
            )}
          </Button>
          <h1 className="text-sm font-semibold">Sero Remote</h1>
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
        </div>
      </header>

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
          <div className="w-80 border-l border-border bg-card shrink-0 overflow-hidden">
            {rightPanel === 'files' && <FilesPanel />}
            {rightPanel === 'artifacts' && <ArtifactPanelConnected />}
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
          <SheetContent side="right" className="w-80 p-0" showCloseButton={false}>
            <SheetHeader className="px-3 py-2 border-b border-border">
              <SheetTitle className="text-sm">
                {rightPanel === 'files' ? 'Files' : 'Artifacts'}
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-hidden">
              {rightPanel === 'files' && <FilesPanel />}
              {rightPanel === 'artifacts' && <ArtifactPanelConnected />}
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
