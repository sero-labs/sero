/**
 * Preload bridge — skill CRUD IPC.
 *
 * Read and delete use the absolute filePath returned by listSkills,
 * since skills can be arbitrarily nested under the skills directory.
 */

import { ipcRenderer } from 'electron';
import { IpcChannels } from '../../../src/types/ipc';
import type { SkillSummary, AvailableSkillSummary, SkillFileData } from '../../../src/types/skills';

export const skillsBridge = {
  listSkills: (): Promise<SkillSummary[]> =>
    ipcRenderer.invoke(IpcChannels.skills.listSkills),
  listAvailableSkills: (): Promise<AvailableSkillSummary[]> =>
    ipcRenderer.invoke(IpcChannels.skills.listAvailableSkills),
  setDisabledModelSkills: (skillNames: string[]): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.skills.setDisabledModelSkills, skillNames),
  readSkill: (filePath: string): Promise<SkillFileData> =>
    ipcRenderer.invoke(IpcChannels.skills.readSkill, filePath),
  writeSkill: (data: SkillFileData): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.skills.writeSkill, data),
  deleteSkill: (filePath: string): Promise<void> =>
    ipcRenderer.invoke(IpcChannels.skills.deleteSkill, filePath),
};
