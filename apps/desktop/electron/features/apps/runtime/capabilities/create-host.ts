import { appStateManager } from '@electron/features/apps/state/manager';
import { subagentManager } from '@electron/features/subagent/singleton';
import { getSubagentToolCatalog, warmSubagentToolCatalog } from '@electron/features/subagent/runtime/tool-catalog';
import { workspaceManager } from '@electron/features/workspace/manager';
import { listWorkspaceAccessRoots } from '@electron/features/workspace/access-roots';
import { runtimeManager } from '@electron/features/workspace/runtime/runtime-manager';
import { showNotification } from '@electron/platform/desktop/notifications';
import { requestChoice } from '@electron/platform/desktop/request-choice';
import { runWorkspaceCommand } from '@electron/features/workspace/runtime/run-workspace-command';
import { refreshWorkspaceRuntimeAfterSync } from '@electron/features/workspace/runtime/refresh-after-sync';
import { resolveWorkspaceRuntime } from '@electron/features/workspace/runtime-resolution';
import { startManagedDevServer } from '@electron/features/workspace/runtime/start-managed-dev-server';
import {
  detectCompileCommands,
  detectDependencyInstallCommand,
  detectDevServerCommand,
  detectVerificationCommands,
  runDevServerSmokeCheck,
  runVerificationCommands,
  summarizeVerificationFailure,
} from '@electron/features/workspace/runtime/verification';
import { WorktreeManager } from '@electron/features/git/worktree/manager';
import {
  createCheckpointInWorktree,
  getWorktreeDiff,
  getWorktreeDiffSummary,
  pushWorktreeBranch,
} from '@electron/features/git/worktree/git';
import {
  createPrFromWorktree,
  ensureRemoteDefaultBranch,
} from '@electron/features/git/worktree/pull-request';
import { syncWorktreeBranchWithDefaultBranch } from '@electron/features/git/worktree/sync';
import { syncWorkspaceRootToDefaultBranch } from '@electron/features/git/worktree/workspace-sync';
import { getWorkspaceStatus, stashWorkspaceChanges } from '@electron/features/git/worktree/workspace-preflight';
import { ghForPath } from '@electron/features/git/github/invoker';
import {
  listOpenIssues,
  listOpenPullRequests,
  mergePullRequest,
} from '@electron/features/git/github/pull-requests';
import {
  getPullRequestMergeError,
  getPullRequestMergeState,
} from '@electron/features/git/github/merge-state';
import { mkdir } from 'fs/promises';
import path from 'path';

import { SERO_HOME, SERO_HOST_ARTIFACTS_ROOT } from '@electron/platform/env';
import {
  createHostToolResolver,
  isToolName,
  type HostToolResolver,
} from '@electron/features/workspace/runtime/toolchains/host-tool-resolver';
import { ensureAiInfra } from '@electron/shared/infra/ai-infra';
import { buildAvailableModelGroups } from '@electron/ipc/agent/core/model-groups';
import { validateRuntimeCustomTools } from './custom-tools';
import { getProviderApiKey } from './provider-credentials';
import { createMediaHost } from './media';
import { createSessionHost } from './session-host';
import type { AppRuntimeTarget, AppRuntimeHost } from '../types';

const worktreeManager = new WorktreeManager();

let hostToolResolver: HostToolResolver | null = null;

function toolResolver(): HostToolResolver {
  hostToolResolver ??= createHostToolResolver();
  return hostToolResolver;
}

function matchesRun(
  entry: { workspaceId: string; parentSessionId: string } | undefined,
  workspaceId: string,
  parentSessionId: string,
): boolean {
  return entry?.workspaceId === workspaceId && entry.parentSessionId === parentSessionId;
}

async function runtimeFromServerId(serverId: string) {
  const workspaceId = serverId.split(':')[0];
  if (!workspaceId) throw new Error(`Cannot resolve workspace from dev server id: ${serverId}`);
  return runtimeManager.getRuntime(workspaceId);
}

export function createAppRuntimeHost(_target: AppRuntimeTarget): AppRuntimeHost {
  return {
    appState: {
      read: async <T = unknown>(filePath: string) => appStateManager.read(filePath) as T | null,
      update: <T = unknown>(filePath: string, updater: (current: T | null) => T) => appStateManager.update(filePath, updater),
      watch: (filePath) => appStateManager.watch(filePath),
      unwatch: (filePath) => appStateManager.unwatch(filePath),
      globalDir: async (namespace) => {
        if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(namespace)) {
          throw new Error(`Invalid global app-state namespace: ${namespace}`);
        }
        // Profile-scoped, shared across all the profile's workspaces — the same
        // convention a `scope: "global"` app uses for its state file.
        const dir = path.join(SERO_HOME, 'apps', namespace);
        await mkdir(dir, { recursive: true });
        return { path: dir };
      },
    },
    subagents: {
      runStructured: async (params) => subagentManager.runSingleStructured({
        ...params,
        customTools: validateRuntimeCustomTools(params.customTools),
      }),
      async listToolCatalog(_workspaceId) {
        // The catalog is profile-global (plugin tools are profile-scoped), so it
        // ignores workspaceId; warm ensures it is published before first use.
        await warmSubagentToolCatalog();
        return getSubagentToolCatalog();
      },
      async listAgentCatalog(_workspaceId) {
        // Named agent roles live in the profile-global agents dir (workspace-independent).
        const agents = await subagentManager.listAgents();
        return agents.map((agent) => ({ name: agent.name, description: agent.description }));
      },
      onLiveOutput(workspaceId, parentSessionId, cb) {
        const handleLiveOutput = (id: string, text: string) => {
          const entry = subagentManager.tracker.get(id);
          if (!entry || !matchesRun(entry, workspaceId, parentSessionId)) return;
          cb(entry.agentName, text);
        };

        subagentManager.tracker.on('subagent_live_output', handleLiveOutput);
        return () => {
          subagentManager.tracker.off('subagent_live_output', handleLiveOutput);
        };
      },
    },
    workspace: {
      runCommand: (workspaceId, cwd, command, timeoutMs, options) =>
        runWorkspaceCommand(workspaceId, cwd, command, timeoutMs, options),
      refreshAfterSync: (workspaceId, workspacePath) =>
        refreshWorkspaceRuntimeAfterSync(workspaceId, workspacePath),
      resolveRuntime: (workspaceId) => resolveWorkspaceRuntime(workspaceId),
      listAccessRoots: (workspaceId) => listWorkspaceAccessRoots(workspaceManager, workspaceId),
      list: async () => {
        const workspaces = await workspaceManager.list();
        return workspaces.map((ws) => ({ id: ws.id, name: ws.name, path: ws.path, open: ws.open }));
      },
    },
    verification: {
      detectCompileCommands,
      detectDependencyInstallCommand,
      detectDevServerCommand,
      detectVerificationCommands,
      runCommands: (workspaceId, cwd, commands, timeoutMs, options) =>
        runVerificationCommands(cwd, commands, timeoutMs, {
          runCommand: (command, commandCwd, commandTimeoutMs) =>
            runWorkspaceCommand(workspaceId, commandCwd, command, commandTimeoutMs, options),
        }),
      runDevServerSmokeCheck: (workspaceId, cwd, command, options) =>
        runDevServerSmokeCheck(cwd, command, {
          startupTimeoutMs: options?.startupTimeoutMs,
          runCommand: (innerCommand, commandCwd, commandTimeoutMs) =>
            runWorkspaceCommand(workspaceId, commandCwd, innerCommand, commandTimeoutMs, options),
        }),
      summarizeFailure: summarizeVerificationFailure,
    },
    git: {
      createWorktree: (workspacePath, cardId, cardTitle, options) =>
        worktreeManager.create(workspacePath, cardId, cardTitle, options),
      removeWorktree: (workspacePath, cardId, options) =>
        worktreeManager.remove(workspacePath, cardId, options),
      getWorkspaceStatus,
      stashWorkspaceChanges,
      syncWorktreeWithDefaultBranch: (worktreePath, options) =>
        syncWorktreeBranchWithDefaultBranch(worktreePath, options),
      syncWorkspaceRootToDefaultBranch,
      createCheckpoint: createCheckpointInWorktree,
      getDiffSummary: getWorktreeDiffSummary,
      getDiff: getWorktreeDiff,
      pushBranch: pushWorktreeBranch,
      ensureRemoteDefaultBranch,
      listPullRequests: (cwd, options) => listOpenPullRequests(ghForPath(cwd), options),
      listIssues: (cwd) => listOpenIssues(ghForPath(cwd)),
      createPr: createPrFromWorktree,
      mergePr: (cwd, prNumber, options) => mergePullRequest(ghForPath(cwd), prNumber, options),
      getPrMergeState: (cwd, prNumber) => getPullRequestMergeState(ghForPath(cwd), prNumber),
      getPrMergeError: (cwd, prNumber) => getPullRequestMergeError(ghForPath(cwd), prNumber),
    },
    devServers: {
      startManaged: startManagedDevServer,
      list: (workspaceId) => runtimeManager.listDevServersSync(workspaceId).map((server) => ({
        id: server.id,
        workspaceId,
        name: server.id,
        port: server.port,
        url: server.url,
        command: server.command,
        cwd: server.cwd,
        scope: 'workspace' as const,
        status: 'running' as const,
        registeredAt: new Date(0).toISOString(),
      })),
      stop: async (serverId) => {
        const runtime = await runtimeFromServerId(serverId);
        await runtime.stopDevServer({ serverId });
        return true;
      },
      restart: async (serverId) => {
        const runtime = await runtimeFromServerId(serverId);
        await runtime.restartDevServer({ serverId });
        return true;
      },
      unregister: (serverId) => {
        void runtimeFromServerId(serverId)
          .then((runtime) => runtime.stopDevServer({ serverId }))
          .catch((err) => console.warn('[app-runtime] Failed to unregister dev server:', err));
        return true;
      },
    },
    notifications: {
      notify: (options) => {
        showNotification(options);
      },
      requestChoice,
    },
    credentials: {
      getProviderApiKey: (providerId) => getProviderApiKey(providerId, SERO_HOME),
    },
    models: {
      list: async () => {
        const { modelRuntime } = await ensureAiInfra();
        return buildAvailableModelGroups(await modelRuntime.getAvailable());
      },
    },
    media: createMediaHost(),
    session: createSessionHost(),
    toolchains: {
      ensure: async (tool) => {
        if (!isToolName(tool)) throw new Error(`Unknown managed tool: ${tool}`);
        const resolution = await toolResolver().ensure(tool, { kind: 'plugin-install' });
        return { path: resolution.path };
      },
      sharedToolsDir: async (namespace) => {
        if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(namespace)) {
          throw new Error(`Invalid shared tools namespace: ${namespace}`);
        }
        // Machine-level, profile-independent — sibling of toolchains/ so the
        // toolchain version GC never scans it.
        const dir = path.join(SERO_HOST_ARTIFACTS_ROOT, 'app-tools', namespace);
        await mkdir(dir, { recursive: true });
        return { path: dir };
      },
    },
  };
}
