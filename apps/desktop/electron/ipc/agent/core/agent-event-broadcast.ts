import { IpcChannels } from '@/types/ipc-channels';
import type { AgentStreamEvent } from '@/types/ipc';
import { forwardEventToGateway } from '@electron/features/gateway/bridge/agent-bridge';
import { broadcastToWindows } from '../../lib/window-broadcast';

export function emitAgentEvent(event: AgentStreamEvent): void {
  broadcastToWindows(IpcChannels.agent.event, event);
  forwardEventToGateway({ ...event });
}
