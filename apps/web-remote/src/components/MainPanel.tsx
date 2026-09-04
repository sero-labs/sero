/**
 * Main panel — the board, a conversation, or the dashboard.
 *
 * `ChatPanel` keeps one position in the tree across every view switch,
 * so a composer draft survives a trip to the board and back.
 */

import { LayoutGrid } from 'lucide-react';
import { EmptyState } from '@sero-ai/ui';
import { useWorkspaceStore } from '@/stores/workspace';
import { ChatPanel } from './ChatPanel';
import { BoardView } from './board/BoardView';

export function MainPanel() {
  const view = useWorkspaceStore((s) => s.view);

  return (
    <div className="h-full">
      <div className="h-full" hidden={view !== 'chat'}>
        <ChatPanel />
      </div>

      {view === 'board' && <BoardView />}

      {view === 'dashboard' && (
        <div className="flex h-full items-center justify-center">
          <EmptyState
            icon={LayoutGrid}
            title="No widgets yet"
            message="Remote widgets are not available in this build."
          />
        </div>
      )}
    </div>
  );
}
