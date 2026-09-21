/**
 * One Workflow on its own page, reached from the full-width Workflows list.
 *
 * The Workflow detail draws its own top row, with the way back beside its name.
 * While its record is still being read, the page says so rather than telling
 * the user to select something.
 */

import type { LibraryIndex, Loop, LoopSummary, OrchestratorAction } from '../../shared/types';
import { WORKFLOWS_LABEL } from '../../shared/labels';
import { LoopDetail } from './LoopDetail';

export interface WorkflowPageProps {
  /** The watched record, or null while it is being read. */
  loop: Loop | null;
  /** The watched index entry for the same Workflow, for the state line. */
  summary: LoopSummary | null;
  busy: boolean;
  onAction: (action: OrchestratorAction) => void;
  onDispatch: (params: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  stateDir: string;
  libraryDir: string | null;
  libraryIndex: LibraryIndex;
  onBack: () => void;
}

export function WorkflowPage({ loop, summary, busy, onAction, onDispatch, stateDir, libraryDir, libraryIndex, onBack }: WorkflowPageProps) {
  if (loop) {
    return (
      <LoopDetail
        loop={loop}
        summary={summary}
        busy={busy}
        onAction={onAction}
        onDispatch={onDispatch}
        stateDir={stateDir}
        libraryDir={libraryDir}
        libraryIndex={libraryIndex}
        onBack={onBack}
      />
    );
  }
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-room-line px-4 py-2">
        <button type="button" className="text-xs text-room-text3 hover:text-room-text" onClick={onBack}>
          ← {WORKFLOWS_LABEL}
        </button>
      </div>
      <div className="flex flex-1 items-center justify-center text-sm text-room-text3">Reading this Workflow…</div>
    </div>
  );
}
