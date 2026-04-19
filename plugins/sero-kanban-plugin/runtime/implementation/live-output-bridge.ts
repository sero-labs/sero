/**
 * Bridge subagent live-output events into kanban phase progress trackers.
 *
 * This lets card detail panels show the same streamed text users see in the
 * orchestration sidebar without introducing a second renderer-side subscription.
 */

import type { LiveOutputSink } from '../core/base-progress';
import type { KanbanRuntimeHost } from '../types';

export function bridgeSubagentLiveOutput(
  host: Pick<KanbanRuntimeHost, 'subagents'>,
  workspaceId: string,
  parentSessionId: string,
  sink: LiveOutputSink,
): () => void {
  return host.subagents.onLiveOutput(workspaceId, parentSessionId, (agentName, text) => {
    sink.setLiveOutput(agentName, text);
  });
}
