/**
 * Session policy for a subagent run: where the run works, and which tools its
 * session may use. Pure decisions, kept apart from the run's lifecycle so the
 * runner stays small and this logic stays testable on its own.
 */

import type { CreateAgentSessionOptions, LoadExtensionsResult, ToolDefinition } from '@earendil-works/pi-coding-agent';

import type { PlatformToolPolicy } from '../core/types';
import { SEARCH_TOOL_NAMES } from '@electron/features/apps/extensions/search-plugin';
import { CODEMODE_TOOL_NAME } from '@electron/features/codemode';
import { WORKSPACE_DIR } from '@electron/features/container/tools/tool-schemas';
import { deferExtensionTools, deferToolsOutside, TOOL_SEARCH_TOOL_NAME } from '@electron/features/tool-loadout';
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

/**
 * Pi loads the `codemode` extension only when its tool is named in an explicit
 * tool allowlist, so an allowed `codemode` joins the allowlist that
 * `sessionToolOptions` built. With no allowlist there is nothing to join: the
 * extension loads and `activateCodemode` switches the tool on.
 */
export function codemodeToolOptions(
  policy: PlatformToolPolicy,
  sessionTools: ToolDefinition[],
  allowlist: string[] | undefined,
  codemodeAllowed: boolean,
): Pick<CreateAgentSessionOptions, 'tools'> {
  if (!codemodeAllowed) return {};
  const { tools } = sessionToolOptions(policy, sessionTools, allowlist);
  if (!tools || tools.includes(CODEMODE_TOOL_NAME)) return {};
  return { tools: [...tools, CODEMODE_TOOL_NAME] };
}

export interface WorkerToolPlan {
  options: Pick<CreateAgentSessionOptions, 'noTools' | 'tools'>;
  customTools: ToolDefinition[];
  /**
   * The tools declared to the model when the session opens. Pi declares every
   * tool named in `tools`, deferred ones included, so a loadout run narrows
   * the declared set itself. Omitted for a bounded run.
   */
  initialTools?: string[];
  /** Whether Code Mode starts switched on. When it is registered but not loaded, `tool_search` finds it. */
  activateCodemode: boolean;
}

/**
 * The tools a worker session registers and which of them start loaded.
 *
 * An allowlist normally bounds the session: the caller or the user chose
 * exactly those tools. When the caller says the list is only an initial
 * loadout (the Orchestrator's planner picks), the session registers everything
 * the host's tool policy allows and defers the rest, so a worker can find
 * another allowed tool with `tool_search` instead of failing the step. The
 * policy, the read-only restriction, the session-kind exclusions and the
 * user's disabled tools decide what that is, exactly as they do for a run with
 * no allowlist. The list never adds authority.
 */
export function planWorkerTools(input: {
  policy: PlatformToolPolicy;
  /** The session's platform and run-scoped tools, with disabled tools already removed. */
  customTools: ToolDefinition[];
  allowlist: string[] | undefined;
  allowlistIsLoadout: boolean;
  disabledTools: ReadonlySet<string>;
  /** Read only for a loadout run, after the extensions have loaded. */
  extensions: () => LoadExtensionsResult;
}): WorkerToolPlan {
  const { policy, customTools, disabledTools } = input;
  const allowlist = input.allowlist && input.allowlist.length > 0 ? input.allowlist : undefined;
  // Pi's `codemode` is a session tool, not a custom tool. An allowlist wins,
  // otherwise only a disabled tool takes it away.
  const codemodeAllowed = allowlist
    ? allowlist.includes(CODEMODE_TOOL_NAME)
    : !disabledTools.has(CODEMODE_TOOL_NAME);

  if (!allowlist || !input.allowlistIsLoadout) {
    return {
      options: {
        ...sessionToolOptions(policy, customTools, allowlist),
        ...codemodeToolOptions(policy, customTools, allowlist, codemodeAllowed),
      },
      customTools,
      activateCodemode: codemodeAllowed,
    };
  }

  const loadout = new Set(allowlist);
  const base = sessionToolOptions(policy, customTools, undefined).tools;
  const extensionTools = input.extensions().extensions.flatMap((extension) => [...extension.tools.keys()]);
  // Under the full policy every plugin tool the loaded extensions provide is
  // allowed. A restricted policy allows only what it already lists.
  const policyTools = policy === 'all' ? [...customTools.map((tool) => tool.name), ...extensionTools] : base ?? [];
  const authorized = new Set([
    ...allowlist,
    ...policyTools.filter((name) => !disabledTools.has(name) && name !== TOOL_SEARCH_TOOL_NAME),
  ]);
  // Code Mode is registered whenever the user has not turned it off.
  if (!disabledTools.has(CODEMODE_TOOL_NAME)) authorized.add(CODEMODE_TOOL_NAME);

  const deferredExtensionTools = deferExtensionTools(input.extensions(), loadout);
  const hasDeferred = deferredExtensionTools.length > 0
    || customTools.some((tool) => !loadout.has(tool.name));
  return {
    options: {
      noTools: 'builtin',
      tools: [...authorized, ...(hasDeferred ? [TOOL_SEARCH_TOOL_NAME] : [])],
    },
    ...(hasDeferred ? { initialTools: [...allowlist, TOOL_SEARCH_TOOL_NAME] } : {}),
    customTools: deferToolsOutside(customTools, loadout),
    // A tool outside the loadout is found, not started.
    activateCodemode: loadout.has(CODEMODE_TOOL_NAME),
  };
}
