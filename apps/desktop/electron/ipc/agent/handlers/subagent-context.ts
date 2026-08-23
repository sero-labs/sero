/**
 * Subagent context IPC — session-independent available context for a
 * workspace's background subagents (tools + skills).
 *
 * Unlike `agent.getContext` (which reads a live session), this enumerates the
 * context a freshly-spawned background subagent would receive, so app modules
 * (e.g. the Orchestrator loop context override) can offer tool/skill toggles
 * without an active session. Skills are read from disk via the same resource
 * loader the runner uses; tools come from the shared subagent tool catalog,
 * published once at startup and refreshed from real runs (see `tool-catalog`).
 */

import path from 'path';
import { ipcMain } from 'electron';
import {
  DefaultResourceLoader,
  type LoadSkillsResult,
  type SettingsManager,
} from '@earendil-works/pi-coding-agent';
import type { AvailableContext, ContextAgentInfo, ContextSkillInfo } from '@sero-ai/common';
import { IpcChannels } from '@/types/ipc-channels';
import { ensureInfra } from '@electron/shared/infra/shared-infra';
import { workspaceManager } from '@electron/features/workspace/manager';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import { createSubagentSkillOverride } from '@electron/features/subagent/runtime/skill-pipeline';
import { getSubagentToolCatalog, warmSubagentToolCatalog } from '@electron/features/subagent/runtime/tool-catalog';
import { discoverAgents } from '@electron/features/subagent/runtime/discovery';
import { createRoomSkillOverride } from '@electron/features/apps/extensions/room-skills';

const AGENTS_DIR = path.join(SERO_AGENT_DIR, 'agents');

async function listWorkspaceAgents(): Promise<ContextAgentInfo[]> {
  const agents = await discoverAgents(AGENTS_DIR);
  return agents.map((a) => ({ name: a.name, description: a.description }));
}

type SkillOverrideFactory = (
  settingsManager: Pick<SettingsManager, 'getGlobalSettings'>,
) => (base: LoadSkillsResult) => LoadSkillsResult;

async function listWorkspaceSkills(
  workspaceId: string,
  createSkillOverride: SkillOverrideFactory,
): Promise<ContextSkillInfo[]> {
  const infra = await ensureInfra();
  const cwd = workspaceManager.getPath(workspaceId) ?? process.cwd();
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: SERO_AGENT_DIR,
    settingsManager: infra.settingsManager,
    skillsOverride: createSkillOverride(infra.settingsManager),
  });
  await loader.reload();
  return loader.getSkills().skills.map((s) => ({
    name: s.name,
    description: s.description,
    filePath: s.filePath,
  }));
}

/** Skills that Room planning can offer and a Room member can load. */
export async function getRoomSkillCatalog(workspaceId: string): Promise<ContextSkillInfo[]> {
  try {
    return await listWorkspaceSkills(workspaceId, createRoomSkillOverride);
  } catch (err) {
    console.warn('[subagent-context] Room skill enumeration failed:', err);
    return [];
  }
}

export async function getSubagentAvailableContext(workspaceId: string): Promise<AvailableContext> {
  // Ensure the catalog is published before first use (no-op once warmed).
  await warmSubagentToolCatalog();

  let skills: ContextSkillInfo[] = [];
  try {
    skills = await listWorkspaceSkills(workspaceId, createSubagentSkillOverride);
  } catch (err) {
    console.warn('[subagent-context] skill enumeration failed:', err);
  }
  let agents: ContextAgentInfo[] = [];
  try {
    agents = await listWorkspaceAgents();
  } catch (err) {
    console.warn('[subagent-context] agent enumeration failed:', err);
  }
  return { systemPrompt: '', tools: getSubagentToolCatalog(), skills, agents, overrides: null };
}

export function registerSubagentContextHandlers(): void {
  // Publish the tool catalog at startup so it is ready before any subagent runs.
  void warmSubagentToolCatalog();

  ipcMain.handle(
    IpcChannels.subagentContext.get,
    (_event, workspaceId: string): Promise<AvailableContext> => getSubagentAvailableContext(workspaceId),
  );
}
