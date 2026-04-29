import { useAppState } from '@sero-ai/app-runtime';

import type { NotesState } from '../../shared/types';
import { DEFAULT_STATE } from '../../shared/types';
// Every directly-exposed MF entry must import its own stylesheet so external
// remotes ship their own CSS assets.
import '../styles.css';

export function NotesWidget() {
  const [state] = useAppState<NotesState>(DEFAULT_STATE);
  const open = state.notes.filter((n) => !n.done);

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold tabular-nums text-foreground">
          {open.length}
        </span>
        <span className="text-xs text-muted-foreground">
          open / {state.notes.length} total
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
        {open.slice(0, 5).map((note) => (
          <div
            key={note.id}
            className="truncate rounded-md bg-secondary px-2 py-1 text-xs text-foreground"
          >
            {note.title}
          </div>
        ))}
        {open.length > 5 && (
          <span className="text-[10px] text-muted-foreground">
            +{open.length - 5} more
          </span>
        )}
        {open.length === 0 && (
          <span className="text-xs text-muted-foreground">All done.</span>
        )}
      </div>
    </div>
  );
}

export default NotesWidget;
