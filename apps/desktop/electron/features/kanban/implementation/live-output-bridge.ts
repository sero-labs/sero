/**
 * Bridge subagent live-output events into kanban phase progress trackers.
 *
 * This lets card detail panels show the same streamed text users see in the
 * orchestration sidebar without introducing a second renderer-side subscription.
 */

import type { LiveOutputSink } from '../core/base-progress';
import type { SubagentEntry } from '@electron/features/subagent/core/types';
import type { SubagentManager } from '@electron/features/subagent';

function matchesRun(
  entry: Pick<SubagentEntry, 'workspaceId' | 'parentSessionId'>,
  workspaceId: string,
  parentSessionId: string,
): boolean {
  return entry.workspaceId === workspaceId && entry.parentSessionId === parentSessionId;
}

export function bridgeSubagentLiveOutput(
  subagentManager: SubagentManager,
  workspaceId: string,
  parentSessionId: string,
  sink: LiveOutputSink,
): () => void {
  const handleLiveOutput = (id: string, text: string) => {
    const entry = subagentManager.tracker.get(id);
    if (!entry || !matchesRun(entry, workspaceId, parentSessionId)) return;
    sink.setLiveOutput(entry.agentName, text);
  };

  subagentManager.tracker.on('subagent_live_output', handleLiveOutput);

  return () => {
    subagentManager.tracker.off('subagent_live_output', handleLiveOutput);
  };
}
