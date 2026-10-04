/**
 * Session policy for a subagent run: where the run works, and which tools its
 * session may use. Pure decisions, kept apart from the run's lifecycle so the
 * runner stays small and this logic stays testable on its own.
 */

import type { CreateAgentSessionOptions, ToolDefinition } from '@earendil-works/pi-coding-agent';

import type { PlatformToolPolicy } from '../core/types';
import { SEARCH_TOOL_NAMES } from '@electron/features/apps/extensions/search-plugin';
import { WORKSPACE_DIR } from '@electron/features/container/tools/tool-schemas';
import path from 'path';

export interface ResolvedSubagentPaths {
  sessionPath: string | null;
  containerHostPath: string | null;
  containerCwd?: string;
}

/**
 * Resolve the host/session/container paths for a subagent run.
 *
 * `cwdOverride` may point at a git worktree inside the workspace. In that
 * case the agent should still run tools from the worktree, but the container
 * itself must mount the workspace root so Git can see `.git/worktrees/...`.
 */
export function resolveSubagentPaths(
  workspaceRoot: string | undefined,
  cwdOverride?: string,
): ResolvedSubagentPaths {
  const sessionPath = cwdOverride ?? workspaceRoot ?? null;
  const containerHostPath = workspaceRoot ?? sessionPath;

  if (!sessionPath) {
    return {
      sessionPath: null,
      containerHostPath: null,
    };
  }

  if (!cwdOverride || !workspaceRoot) {
    return {
      sessionPath,
      containerHostPath,
    };
  }

  const rel = path.relative(workspaceRoot, cwdOverride);
  if (!rel || rel === '.') {
    return {
      sessionPath,
      containerHostPath,
      containerCwd: WORKSPACE_DIR,
    };
  }
  if (rel.startsWith('..')) {
    return {
      sessionPath,
      containerHostPath,
    };
  }

  return {
    sessionPath,
    containerHostPath,
    containerCwd: `${WORKSPACE_DIR}/${rel}`,
  };
}

/**
 * Apply the platform-tool policy to the workspace tool set.
 * 'none' callers skip building platform tools entirely; this filter
 * handles 'all' and 'readOnly'.
 */
export function filterPlatformTools(
  tools: ToolDefinition[],
  policy: PlatformToolPolicy,
): ToolDefinition[] {
  if (policy === 'none') return [];
  if (policy === 'readOnly') return tools.filter((tool) => tool.name === 'read');
  return tools;
}

/**
 * Session tool enforcement for the platform-tool policy.
 *
 * `noTools: 'builtin'` disables only Pi built-ins; tools registered by
 * extensions loaded into the session survive it. Restricted policies
 * therefore set an explicit allowlist of exactly the session's tools,
 * which excludes extension-registered tools as well.
 */
export function sessionToolOptions(
  policy: PlatformToolPolicy,
  sessionTools: ToolDefinition[],
  allowlist?: string[],
): Pick<CreateAgentSessionOptions, 'noTools' | 'tools'> {
  // A per-step allowlist wins: activate only those tools (the SDK ignores names
  // it doesn't recognise). This also trims the per-tool prompt guidance.
  if (allowlist && allowlist.length > 0) return { noTools: 'builtin', tools: allowlist };
  if (policy === 'all') return { noTools: 'builtin' };

  const names = sessionTools.map((tool) => tool.name);
  // A read-only subagent keeps the read-only search tools. Without them it can
  // read a file it is told about but cannot find one, and its only alternative
  // is the shell this policy exists to withhold. 'none' stays exactly none.
  const searchTools = policy === 'readOnly'
    ? SEARCH_TOOL_NAMES.filter((name) => !names.includes(name))
    : [];
  return { noTools: 'builtin', tools: [...names, ...searchTools] };
}
