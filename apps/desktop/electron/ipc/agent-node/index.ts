import { app, BrowserWindow, ipcMain } from 'electron';
import { IpcChannels } from '@/types/ipc-channels';
import { AGENT_NODE_CONTROL_OPERATIONS } from '@/types/ipc-agent-node';
import type {
  AgentNodeControlArgs,
  AgentNodeEnrolInput,
  AgentNodeMessageInput,
} from '@/types/ipc-agent-node';
import { AgentNodeService } from '@electron/features/agent-node';
import { protectAgentNodeReply } from '@electron/features/agent-node/ipc-security';

let service: AgentNodeService | null = null;

function getService(): AgentNodeService {
  service ??= new AgentNodeService();
  return service;
}

export function registerAgentNodeHandlers(): void {
  const nodes = getService();
  nodes.subscribe((event) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(IpcChannels.agentNode.event, event);
    }
  });

  ipcMain.handle(IpcChannels.agentNode.list, () => nodes.list());
  ipcMain.handle(IpcChannels.agentNode.enrol, (_event, input: AgentNodeEnrolInput) => nodes.enrol(input));
  ipcMain.handle(IpcChannels.agentNode.remove, (_event, nodeId: string) => nodes.remove(nodeId));
  ipcMain.handle(IpcChannels.agentNode.connect, (_event, nodeId: string) => nodes.connect(nodeId));
  ipcMain.handle(
    IpcChannels.agentNode.control,
    async (_event, nodeId: string, args: AgentNodeControlArgs): Promise<unknown> => {
      const operation: string = args.operation;
      if (operation === 'enrol'
        || !AGENT_NODE_CONTROL_OPERATIONS.some((allowed) => allowed === operation)) {
        throw new Error('Control operation is not available through IPC');
      }
      return protectAgentNodeReply(await nodes.control(nodeId, args));
    },
  );
  ipcMain.handle(IpcChannels.agentNode.send, (_event, input: AgentNodeMessageInput) => nodes.send(input));
  ipcMain.handle(IpcChannels.agentNode.getTask, (_event, nodeId: string, taskId: string) => nodes.getTask(nodeId, taskId));
  ipcMain.handle(IpcChannels.agentNode.cancelTask, (_event, nodeId: string, taskId: string) => nodes.cancelTask(nodeId, taskId));
  ipcMain.handle(IpcChannels.agentNode.attach, (_event, nodeId: string, contextId: string, cursor?: string) => nodes.attach(nodeId, contextId, cursor));
  ipcMain.handle(IpcChannels.agentNode.readBlob, (_event, nodeId: string, blobId: string) => nodes.readBlob(nodeId, blobId));
  app.once('before-quit', () => {
    service?.dispose();
    service = null;
  });
}

export function disposeAgentNodeService(): void {
  service?.dispose();
  service = null;
}
