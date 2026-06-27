/**
 * Subagent context IPC — session-independent available context for a
 * workspace's background subagents (tools + skills).
 *
 * Unlike `agent.getContext` (which reads a live session), this enumerates the
 * context a freshly-spawned background subagent would receive, so app modules
 * (e.g. the Orchestrator loop context override) can offer tool/skill toggles
 * without an active session. Skills are read from disk via the same resource
 * loader the runner uses; tools are the standard background-agent surface
 * (`platformTools: 'all'`), listed statically so no container needs to start.
 */

import { ipcMain } from 'electron';
import { DefaultResourceLoader } from '@earendil-works/pi-coding-agent';
import type { AvailableContext, ContextSkillInfo, ContextToolInfo } from '@sero-ai/common';
import { IpcChannels } from '@/types/ipc-channels';
import { ensureInfra } from '@electron/shared/infra/shared-infra';
import { workspaceManager } from '@electron/features/workspace/manager';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import { createSkillVisibilityOverride } from '@electron/features/apps/extensions/skill-visibility';
import { filterCompatiblePluginSkills } from '@electron/features/plugins/resource-compatibility';

/** The standard tool surface a background subagent gets with `platformTools: 'all'`. */
const PLATFORM_TOOLS: ContextToolInfo[] = [
  { name: 'bash', description: 'Run shell commands in the workspace' },
  { name: 'read', description: 'Read a file' },
  { name: 'write', description: 'Write a file' },
  { name: 'edit', description: 'Edit a file' },
  { name: 'sero-cli', description: 'Run Sero workspace commands' },
  { name: 'browser', description: 'Drive an automation browser (when available)' },
];

async function listWorkspaceSkills(workspaceId: string): Promise<ContextSkillInfo[]> {
  const infra = await ensureInfra();
  const cwd = workspaceManager.getPath(workspaceId) ?? process.cwd();
  const skillVisibilityOverride = createSkillVisibilityOverride(infra.settingsManager);
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: SERO_AGENT_DIR,
    settingsManager: infra.settingsManager,
    skillsOverride: (base) => filterCompatiblePluginSkills(skillVisibilityOverride(base)),
  });
  await loader.reload();
  return loader.getSkills().skills.map((s) => ({
    name: s.name,
    description: s.description,
    filePath: s.filePath,
  }));
}

export async function getSubagentAvailableContext(workspaceId: string): Promise<AvailableContext> {
  let skills: ContextSkillInfo[] = [];
  try {
    skills = await listWorkspaceSkills(workspaceId);
  } catch (err) {
    console.warn('[subagent-context] skill enumeration failed:', err);
  }
  return { systemPrompt: '', tools: PLATFORM_TOOLS, skills, overrides: null };
}

export function registerSubagentContextHandlers(): void {
  ipcMain.handle(
    IpcChannels.subagentContext.get,
    (_event, workspaceId: string): Promise<AvailableContext> => getSubagentAvailableContext(workspaceId),
  );
}
