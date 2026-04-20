import type { PluginChangeEvent } from '@/types/ipc';
import { IpcChannels } from '@/types/ipc-channels';
import { broadcastToWindows } from '../lib/window-broadcast';

export function broadcastPluginEvent(event: PluginChangeEvent): void {
  broadcastToWindows(IpcChannels.plugins.event, event);
}
