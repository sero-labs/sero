/**
 * Preload bridge — subagent orchestration IPC.
 *
 * Extracted from preload.ts to keep it under 500 LOC.
 */

import { ipcRenderer } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type {
  SubagentEvent,
  SubagentAgentSummary,
  SubagentAgentFile,
  SubagentEntry,
} from '@/types/ipc';

export const subagentBridge = {
  onEvent: (callback: (event: SubagentEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: SubagentEvent) => {
      callback(data);
    };
    ipcRenderer.on(IpcChannels.subagent.event, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannels.subagent.event, handler);
    };
  },
  listAgents: (): Promise<SubagentAgentSummary[]> =>
    ipcRenderer.invoke(IpcChannels.subagent.listAgents),
  snapshot: (workspaceId: string): Promise<SubagentEntry[]> =>
    ipcRenderer.invoke(IpcChannels.subagent.snapshot, workspaceId),
  abort: (subagentId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.subagent.abort, subagentId),
  clearCompleted: (workspaceId: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.subagent.clearCompleted, workspaceId),
  readAgent: (name: string): Promise<SubagentAgentFile> =>
    ipcRenderer.invoke(IpcChannels.subagent.readAgent, name),
  writeAgent: (data: SubagentAgentFile): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.subagent.writeAgent, data),
  deleteAgent: (name: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.subagent.deleteAgent, name),
};
