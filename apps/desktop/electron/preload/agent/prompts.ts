/**
 * Preload bridge — prompt template CRUD IPC.
 *
 * Read and delete use the absolute filePath returned by listPrompts.
 */

import { ipcRenderer } from 'electron';
import { IpcChannels } from '../../../src/types/ipc';
import type { PromptTemplateSummary, PromptTemplateFileData } from '../../../src/types/prompts';

export const promptsBridge = {
  listPrompts: (): Promise<PromptTemplateSummary[]> =>
    ipcRenderer.invoke(IpcChannels.prompts.listPrompts),
  readPrompt: (filePath: string): Promise<PromptTemplateFileData> =>
    ipcRenderer.invoke(IpcChannels.prompts.readPrompt, filePath),
  writePrompt: (data: PromptTemplateFileData): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.prompts.writePrompt, data),
  deletePrompt: (filePath: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.prompts.deletePrompt, filePath),
};
