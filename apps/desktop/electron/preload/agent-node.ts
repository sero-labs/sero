import { ipcRenderer } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import type { SeroAgentNodesAPI } from '@/types/ipc-agent-node';

export const agentNodesBridge: SeroAgentNodesAPI = {
  list: () => ipcRenderer.invoke(IpcChannels.agentNode.list),
  enrol: (input) => ipcRenderer.invoke(IpcChannels.agentNode.enrol, input),
  remove: (nodeId) => ipcRenderer.invoke(IpcChannels.agentNode.remove, nodeId),
  connect: (nodeId) => ipcRenderer.invoke(IpcChannels.agentNode.connect, nodeId),
  control: (nodeId, args) => ipcRenderer.invoke(IpcChannels.agentNode.control, nodeId, args),
  send: (input) => ipcRenderer.invoke(IpcChannels.agentNode.send, input),
  getTask: (nodeId, taskId) => ipcRenderer.invoke(IpcChannels.agentNode.getTask, nodeId, taskId),
  cancelTask: (nodeId, taskId) => ipcRenderer.invoke(IpcChannels.agentNode.cancelTask, nodeId, taskId),
  attach: (nodeId, contextId, cursor, taskId) => ipcRenderer.invoke(IpcChannels.agentNode.attach, nodeId, contextId, cursor, taskId),
  readBlob: (nodeId, blobId) => ipcRenderer.invoke(IpcChannels.agentNode.readBlob, nodeId, blobId),
  onEvent: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: Parameters<typeof callback>[0]) => callback(value);
    ipcRenderer.on(IpcChannels.agentNode.event, listener);
    return () => ipcRenderer.removeListener(IpcChannels.agentNode.event, listener);
  },
};
