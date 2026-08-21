/**
 * IPC handlers for skill CRUD.
 *
 * The file mechanics — discovery, frontmatter, atomic write, path validation —
 * live in [features/skills/store.ts](../../../features/skills/store.ts), shared
 * with the gated `appRuntime.skills` runtime capability. These handlers add the
 * renderer-facing parts: the available-skill catalogue, the model-visibility
 * setting, and the session hot reload after a write or a delete.
 */

import { ipcMain } from 'electron';
import {
  DefaultResourceLoader,
} from '@earendil-works/pi-coding-agent';
import { IpcChannels } from '@/types/ipc-channels';
import { SERO_AGENT_DIR, SERO_HOME } from '@electron/platform/env';
import { appStateManager } from '@electron/features/apps/state/manager';
import { reloadAllSessionResources } from '../core/agent';
import { ensureInfra, applyRuntimeSettings, SERO_CONFIG_PATH } from '@electron/shared/infra/shared-infra';
import { withDisabledModelSkills } from '@sero-ai/common';
import { withAgentPluginSkills } from '@electron/features/agent-plugins/skills';
import { approveSkillWrite } from '@electron/features/skills/write-approvals';
import {
  deleteSkillFile,
  listUserSkills,
  readSkillFile,
  toSkillSource,
  writeSkillFile,
} from '@electron/features/skills/store';
import type { SkillSummary, AvailableSkillSummary, SkillFileData } from '@/types/skills';

async function refreshRuntimeSettings(): Promise<void> {
  const infra = await ensureInfra();
  infra.settingsManager.reload();
  applyRuntimeSettings(infra.settingsManager);
  await reloadAllSessionResources();
}

/** Hot-reload active sessions so a skill change lands without restarting Sero. */
function reloadSessions(): void {
  reloadAllSessionResources().catch((err) =>
    console.error('[skills] reloadAllSessionResources failed:', err),
  );
}

export function registerSkillHandlers(): void {
  ipcMain.handle(
    IpcChannels.skills.listSkills,
    async (): Promise<SkillSummary[]> => listUserSkills(),
  );

  ipcMain.handle(
    IpcChannels.skills.listAvailableSkills,
    async (): Promise<AvailableSkillSummary[]> => {
      const infra = await ensureInfra();
      infra.settingsManager.reload();

      const loader = new DefaultResourceLoader({
        cwd: SERO_HOME,
        agentDir: SERO_AGENT_DIR,
        settingsManager: infra.settingsManager,
        noExtensions: true,
        noPromptTemplates: true,
        noThemes: true,
        skillsOverride: withAgentPluginSkills,
      });
      await loader.reload();

      const { skills } = loader.getSkills();
      return skills
        .map((skill) => ({
          name: skill.name,
          description: skill.description,
          source: toSkillSource(skill.sourceInfo),
          disableModelInvocation: skill.disableModelInvocation,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  );

  ipcMain.handle(
    IpcChannels.skills.setDisabledModelSkills,
    async (_e, skillNames: string[]): Promise<void> => {
      const normalizedSkillNames = Array.isArray(skillNames)
        ? skillNames.filter((name): name is string => typeof name === 'string')
        : [];

      await appStateManager.update<Record<string, unknown>>(
        SERO_CONFIG_PATH,
        (current) => withDisabledModelSkills(current ?? {}, normalizedSkillNames),
      );
      await refreshRuntimeSettings();
    },
  );

  /** Read a skill by its absolute filePath (returned by listSkills). */
  ipcMain.handle(
    IpcChannels.skills.readSkill,
    async (_e, filePath: string): Promise<SkillFileData> => readSkillFile(filePath),
  );

  /**
   * Write a skill. With `filePath` it overwrites that file; otherwise it creates
   * a new skill at SKILLS_DIR/<name>/SKILL.md. Returns the absolute filePath.
   */
  ipcMain.handle(
    IpcChannels.skills.writeSkill,
    async (_e, data: SkillFileData): Promise<string> => {
      const targetPath = await writeSkillFile(data);
      reloadSessions();
      return targetPath;
    },
  );

  /**
   * Approve one runtime skill write. Renderer only: this is the channel a model
   * does not have, and it is what makes the Orchestrator's drafted skill
   * unwritable without the person who reviewed it (spec 18).
   */
  ipcMain.handle(
    IpcChannels.skills.approveSkillWrite,
    async (_e, scope: string, contentHash: string): Promise<void> => {
      approveSkillWrite(scope, contentHash);
    },
  );

  /** Delete a skill by its absolute filePath (removes the skill folder). */
  ipcMain.handle(
    IpcChannels.skills.deleteSkill,
    async (_e, filePath: string): Promise<void> => {
      await deleteSkillFile(filePath);
      reloadSessions();
    },
  );
}
