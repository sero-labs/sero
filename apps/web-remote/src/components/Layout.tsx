/**
 * Layout shell — sidebar + chat + panels.
 * Responsive design: sidebar collapses on mobile.
 */

import { useState, useCallback } from 'react';
import { WorkspacePicker } from './WorkspacePicker';
import { ChatPanel } from './ChatPanel';
import { FileBrowser } from './FileBrowser';
import { FilePreview } from './FilePreview';
import { ArtifactGallery } from './ArtifactGallery';
import { StatusBar } from './StatusBar';
import { useArtifactStore } from '@/stores/artifacts';
import { cn } from '@/lib/cn';
import {
  PanelLeftClose,
  PanelLeftOpen,
  FolderTree,
  Image as ImageIcon,
} from 'lucide-react';

type RightPanel = 'files' | 'artifacts' | null;

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);

  const toggleRightPanel = useCallback(
    (panel: 'files' | 'artifacts') => {
      setRightPanel((current) => (current === panel ? null : panel));
    },
    [],
  );

  return (
    <div className="flex flex-col h-screen">
      {/* Title bar */}
      <header className="h-11 px-3 bg-card border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={toggleSidebar}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
          >
            {sidebarOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeftOpen className="w-4 h-4" />
            )}
          </button>
          <h1 className="text-sm font-semibold">Sero Remote</h1>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => toggleRightPanel('files')}
            className={cn(
              'p-1.5 rounded transition-colors',
              rightPanel === 'files'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            title="File Browser"
          >
            <FolderTree className="w-4 h-4" />
          </button>
          <button
            onClick={() => toggleRightPanel('artifacts')}
            className={cn(
              'p-1.5 rounded transition-colors',
              rightPanel === 'artifacts'
                ? 'bg-accent text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
            title="Artifacts"
          >
            <ImageIcon className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-56 border-r border-border bg-card shrink-0 overflow-hidden">
            <WorkspacePicker />
          </div>
        )}

        {/* Chat panel (center) */}
        <div className="flex-1 min-w-0 relative">
          <ChatPanel />
        </div>

        {/* Right panel */}
        {rightPanel && (
          <div className="w-80 border-l border-border bg-card shrink-0 overflow-hidden">
            {rightPanel === 'files' && (
              <div className="flex flex-col h-full">
                <div className="h-1/3 border-b border-border overflow-hidden">
                  <FileBrowser />
                </div>
                <div className="flex-1 overflow-hidden">
                  <FilePreview />
                </div>
              </div>
            )}
            {rightPanel === 'artifacts' && <ArtifactPanelConnected />}
          </div>
        )}
      </div>

      {/* Status bar */}
      <StatusBar />
    </div>
  );
}

/** Artifact panel wrapper — connects ArtifactGallery to the store. */
function ArtifactPanelConnected() {
  const artifacts = useArtifactStore((s) => s.artifacts);
  const loadArtifactData = useArtifactStore((s) => s.loadArtifactData);

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Artifacts
        </span>
      </div>
      <div className="flex-1 overflow-y-auto">
        <ArtifactGallery
          artifacts={artifacts}
          onLoadArtifact={loadArtifactData}
        />
      </div>
    </div>
  );
}
