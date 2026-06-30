/**
 * Subagent resource loader — the single place that configures the
 * DefaultResourceLoader for a background subagent.
 *
 * Shared by the live runner (one per run, with the per-loop context overrides)
 * and the tool-catalog enumeration (a throwaway session that publishes the real
 * tool surface). Keeping one builder avoids the two drifting apart.
 */

import { DefaultResourceLoader } from '@earendil-works/pi-coding-agent';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import type { SharedInfra } from '@electron/shared/infra/shared-infra';
import { createSubagentExtensionFactory } from './loader';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import { createSkillVisibilityOverride } from '@electron/features/apps/extensions/skill-visibility';
import {
  filterCompatiblePluginAgentsFiles,
  filterCompatiblePluginExtensions,
  filterCompatiblePluginPrompts,
  filterCompatiblePluginSkills,
  filterCompatiblePluginThemes,
} from '@electron/features/plugins/resource-compatibility';

export interface SubagentResourceLoaderOptions {
  /** Working directory the child session runs from (may be a worktree). */
  cwd: string;
  workspaceManager: WorkspaceManager;
  workspaceId: string;
  sessionId: string;
  settingsManager: SharedInfra['settingsManager'];
  containerCwd?: string;
  /**
   * User context override: replaces the base Sero system prompt. `undefined`
   * means "no override" (an empty string still replaces the base).
   */
  systemPromptOverride?: string;
  /**
   * Appended after the resolved system prompt — the agent's `.md` body or the
   * orchestrator step contract. Rides on a separate slot so it survives a base
   * override.
   */
  appendSystemPrompt?: string[];
  /** User context override: skill names to hide from model invocation. */
  disabledSkills?: string[];
}

/**
 * Build the reduced resource loader for a subagent child session. Callers still
 * own `loader.reload()`.
 */
export function createSubagentResourceLoader(
  options: SubagentResourceLoaderOptions,
): DefaultResourceLoader {
  const disabledSkills = new Set(options.disabledSkills ?? []);
  const skillVisibilityOverride = createSkillVisibilityOverride(options.settingsManager);

  return new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: SERO_AGENT_DIR,
    settingsManager: options.settingsManager,
    extensionFactories: [
      createSubagentExtensionFactory(
        options.workspaceManager,
        options.workspaceId,
        options.sessionId,
        undefined,
        options.containerCwd,
      ),
    ],
    skillsOverride: (base) => {
      const filtered = filterCompatiblePluginSkills(skillVisibilityOverride(base));
      if (disabledSkills.size === 0) return filtered;
      return {
        ...filtered,
        skills: filtered.skills.map((skill) =>
          disabledSkills.has(skill.name) ? { ...skill, disableModelInvocation: true } : skill,
        ),
      };
    },
    // User context override: replace the base system prompt. The agent prompt
    // rides on appendSystemPrompt below, so it is always preserved on top.
    systemPromptOverride:
      options.systemPromptOverride !== undefined ? () => options.systemPromptOverride : undefined,
    appendSystemPrompt: options.appendSystemPrompt,
    promptsOverride: filterCompatiblePluginPrompts,
    themesOverride: filterCompatiblePluginThemes,
    extensionsOverride: filterCompatiblePluginExtensions,
    agentsFilesOverride: filterCompatiblePluginAgentsFiles,
  });
}
