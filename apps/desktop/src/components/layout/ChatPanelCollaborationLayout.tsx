import type { ReactNode } from 'react';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@sero-ai/ui/components/ui/resizable';
import type { CollaborationResult, CollaborationStatus } from '@/types/collaboration';

export interface ChatPanelResizeEvent {
  inPixels: number;
  asPercentage: number;
}

interface ChatPanelCollaborationLayoutProps {
  conversation: ReactNode;
  collaboration: ReactNode;
  collaborationVisible: boolean;
  collaborationDefaultSizePct: number;
  onCollaborationResize: (event: ChatPanelResizeEvent) => void;
}

export function isCollaborationSectionVisible(
  status: CollaborationStatus,
  result: CollaborationResult | null,
): boolean {
  return (status !== 'idle' && status !== 'complete') || result !== null;
}

export function ChatPanelCollaborationLayout({
  conversation,
  collaboration,
  collaborationVisible,
  collaborationDefaultSizePct,
  onCollaborationResize,
}: ChatPanelCollaborationLayoutProps) {
  if (!collaborationVisible) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col"
        data-testid="chat-panel-conversation-shell"
      >
        {conversation}
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      id="chat-panel-collaboration-layout"
      orientation="vertical"
      className="min-h-0 flex-1"
      data-testid="chat-panel-collaboration-layout"
    >
      <ResizablePanel
        id="chat-panel-conversation"
        minSize={35}
        className="min-h-0"
        style={{ overflow: 'hidden' }}
      >
        <div
          className="flex h-full min-h-0 flex-col"
          data-testid="chat-panel-conversation-shell"
        >
          {conversation}
        </div>
      </ResizablePanel>

      <ResizableHandle withHandle data-testid="chat-panel-collaboration-handle" />

      <ResizablePanel
        id="chat-panel-collaboration"
        defaultSize={`${collaborationDefaultSizePct}%`}
        minSize={18}
        className="min-h-0"
        onResize={onCollaborationResize}
        style={{ overflow: 'hidden' }}
      >
        <div
          className="flex h-full min-h-0 flex-col border-t border-[var(--border-default)]"
          data-testid="chat-panel-collaboration-shell"
        >
          {collaboration}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
