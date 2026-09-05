import type { WebContents } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { AgentStreamEvent } from '@/types/ipc';
import { forwardEventToGateway } from '@electron/features/gateway/bridge/agent-bridge';
import { broadcastToWindows, sendToWindows } from '../../lib/window-broadcast';

/**
 * Windows that opened a session over IPC, keyed by session id. Agent events
 * go only to these windows. A session no window opened (gateway, CLI) keeps
 * the broadcast so a renderer can still pick it up from its first event.
 */
const viewersBySession = new Map<string, Set<number>>();

type ViewerContents = Pick<WebContents, 'id'> & {
  once(event: 'destroyed', listener: () => void): unknown;
};

export function registerSessionViewer(sessionId: string, contents: ViewerContents): void {
  let viewers = viewersBySession.get(sessionId);
  if (!viewers) {
    viewers = new Set();
    viewersBySession.set(sessionId, viewers);
  }
  if (viewers.has(contents.id)) return;
  viewers.add(contents.id);
  contents.once('destroyed', () => unregisterSessionViewer(sessionId, contents.id));
}

export function unregisterSessionViewer(sessionId: string, webContentsId: number): void {
  const viewers = viewersBySession.get(sessionId);
  if (!viewers) return;
  viewers.delete(webContentsId);
  if (viewers.size === 0) viewersBySession.delete(sessionId);
}

export function clearSessionViewers(sessionId: string): void {
  viewersBySession.delete(sessionId);
}

export function emitAgentEvent(event: AgentStreamEvent): void {
  const viewers = viewersBySession.get(event.sessionId);
  if (viewers) {
    sendToWindows(viewers, IpcChannels.agent.event, event);
  } else {
    broadcastToWindows(IpcChannels.agent.event, event);
  }
  forwardEventToGateway({ ...event });
}
