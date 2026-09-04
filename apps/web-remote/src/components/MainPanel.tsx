/**
 * Main panel — the board, a conversation, or the dashboard.
 *
 * `ChatPanel` keeps one position in the tree across every view switch,
 * so a composer draft survives a trip to the board and back.
 */

import { useWorkspaceStore } from '@/stores/workspace';
import { ChatPanel } from './ChatPanel';
import { BoardView } from './board/BoardView';
import { WidgetsView } from './widgets/WidgetsView';

export function MainPanel() {
  const view = useWorkspaceStore((s) => s.view);

  return (
    <div className="h-full">
      <div className="h-full" hidden={view !== 'chat'}>
        <ChatPanel />
      </div>

      {view === 'board' && <BoardView />}

      {view === 'dashboard' && <WidgetsView />}
    </div>
  );
}
