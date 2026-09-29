/**
 * Subagent resource loader — the single place that configures the
 * DefaultResourceLoader for a background subagent.
 *
 * Shared by the live runner (one per run, with the per-loop context overrides)
 * and the tool-catalog enumeration (a throwaway session that publishes the real
 * tool surface). Keeping one builder avoids the two drifting apart.
 */

import { DefaultResourceLoader, type LoadExtensionsResult } from '@earendil-works/pi-coding-agent';
import type { PlatformToolPolicy } from '../core/types';
import type { WorkspaceManager } from '@electron/features/workspace/manager';
import type { SharedInfra } from '@electron/shared/infra/shared-infra';
import type { ContainerPromptState } from '@electron/features/container/tools/container-prompt-state';
import { createSubagentExtensionFactory } from './loader';
import { SERO_AGENT_DIR } from '@electron/platform/env';
import {
  filterCompatiblePluginAgentsFiles,
  filterCompatiblePluginExtensions,
  filterCompatiblePluginPrompts,
  filterCompatiblePluginThemes,
  packageNameForResourcePath,
} from '@electron/features/plugins/resource-compatibility';
import { bridgeExtensionTools } from '@electron/cli';
import { dropToolsNotForSessionKind } from '@electron/features/plugins/bridge-policy';
import { restrictSearchToolOrigins } from '@electron/features/apps/extensions/search-plugin';
import { createSubagentSkillOverride } from './skill-pipeline';

/**
 * Memory belongs to the user's chat. A subagent gets neither the memory tools
 * nor the memory snapshot, whatever its tool policy.
 */
const CHAT_ONLY_PACKAGES = new Set(['@sero-ai/plugin-memory']);

function withoutChatOnlyPlugins(base: LoadExtensionsResult): LoadExtensionsResult {
  return {
    ...base,
    extensions: base.extensions.filter(
      (extension) => !CHAT_ONLY_PACKAGES.has(packageNameForResourcePath(extension.resolvedPath) ?? ''),
    ),
  };
}

export interface SubagentResourceLoaderOptions {
  /** Working directory the child session runs from (may be a worktree). */
  cwd: string;
  workspaceManager: WorkspaceManager;
  workspaceId: string;
  sessionId: string;
  settingsManager: SharedInfra['settingsManager'];
  containerCwd?: string;
  /** Set when the child session runs in a container workspace. */
  containerState?: ContainerPromptState;
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
  /** Keep conventional search names only when the built-in FFF plugin registered them. */
  restrictSearchTools?: boolean;
  /**
   * Reach plugin tools as `sero-cli` commands, the way a chat does, so their
   * schemas stay out of the session's start-up. Set only when the session has
   * `sero-cli` and no allowlist, because an allowlist approves tools by name.
   */
  bridgePluginTools?: boolean;
  /** Keep tools that their plugin declares for other kinds of session. Only the catalogue enumeration sets this. */
  keepToolsForOtherSessionKinds?: boolean;
}

/**
 * Build the reduced resource loader for a subagent child session. Callers still
 * own `loader.reload()`.
 */
export function createSubagentResourceLoader(
  options: SubagentResourceLoaderOptions,
): DefaultResourceLoader {
  const disabledSkills = new Set(options.disabledSkills ?? []);
  const loadSubagentSkills = createSubagentSkillOverride(options.settingsManager);

  return new DefaultResourceLoader({
    cwd: options.cwd,
    agentDir: SERO_AGENT_DIR,
    settingsManager: options.settingsManager,
    extensionFactories: [
      createSubagentExtensionFactory(
        options.workspaceManager,
        options.workspaceId,
        options.sessionId,
        options.containerState,
        options.containerCwd,
      ),
    ],
    skillsOverride: (base) => {
      const filtered = loadSubagentSkills(base);
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
    extensionsOverride: (base) => {
      const withoutChatOnly = withoutChatOnlyPlugins(filterCompatiblePluginExtensions(base));
      const compatible = options.keepToolsForOtherSessionKinds
        ? withoutChatOnly
        : dropToolsNotForSessionKind(withoutChatOnly, 'subagent');
      const bridged = options.bridgePluginTools
        // A subagent has no chat session behind it, so a slash command could not run.
        ? bridgeExtensionTools(compatible, { sessionId: options.sessionId, bridgeCommands: false })
        : compatible;
      return options.restrictSearchTools ? restrictSearchToolOrigins(bridged) : bridged;
    },
    agentsFilesOverride: filterCompatiblePluginAgentsFiles,
  });
}

/** Whether a subagent run reaches its plugin tools through `sero-cli` instead of as direct tools. */
export function shouldBridgePluginTools(
  policy: PlatformToolPolicy,
  allowlist: string[] | undefined,
  disabledTools: ReadonlySet<string>,
): boolean {
  return policy === 'all' && !(allowlist && allowlist.length > 0) && !disabledTools.has('sero-cli');
}
