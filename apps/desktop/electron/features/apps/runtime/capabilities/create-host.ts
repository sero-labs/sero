import { appStateManager } from '@electron/features/apps/state/manager';
import { subagentManager } from '@electron/features/subagent/singleton';
import { workspaceManager } from '@electron/features/workspace/manager';
import { listWorkspaceAccessRoots } from '@electron/features/workspace/access-roots';
import { runtimeManager } from '@electron/features/workspace/runtime/runtime-manager';
import { showNotification } from '@electron/platform/desktop/notifications';
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
import { WorktreeManager } from '@electron/features/vcs/worktree/manager';
import {
  createCheckpointInWorktree,
  getWorktreeDiff,
  getWorktreeDiffSummary,
  pushWorktreeBranch,
} from '@electron/features/vcs/worktree/git';
import {
  createPrFromWorktree,
  ensureRemoteDefaultBranch,
  mergePrFromWorktree,
} from '@electron/features/vcs/worktree/pull-request';
import { syncWorktreeBranchWithDefaultBranch } from '@electron/features/vcs/worktree/sync';
import { syncWorkspaceRootToDefaultBranch } from '@electron/features/vcs/worktree/workspace-sync';
import {
  getPullRequestMergeError,
  getPullRequestMergeState,
} from '@electron/features/vcs/worktree/merge-status';
import { validateRuntimeCustomTools } from './custom-tools';
import type { AppRuntimeTarget, AppRuntimeHost } from '../types';

const worktreeManager = new WorktreeManager();

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
    },
    subagents: {
      runStructured: async (params) => subagentManager.runSingleStructured({
        ...params,
        customTools: validateRuntimeCustomTools(params.customTools),
      }),
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
      createWorktree: (workspacePath, cardId, cardTitle) =>
        worktreeManager.create(workspacePath, cardId, cardTitle),
      removeWorktree: (workspacePath, cardId, options) =>
        worktreeManager.remove(workspacePath, cardId, options),
      syncWorktreeWithDefaultBranch: (worktreePath, options) =>
        syncWorktreeBranchWithDefaultBranch(worktreePath, options),
      syncWorkspaceRootToDefaultBranch,
      createCheckpoint: createCheckpointInWorktree,
      getDiffSummary: getWorktreeDiffSummary,
      getDiff: getWorktreeDiff,
      pushBranch: pushWorktreeBranch,
      ensureRemoteDefaultBranch,
      createPr: createPrFromWorktree,
      mergePr: mergePrFromWorktree,
      getPrMergeState: getPullRequestMergeState,
      getPrMergeError: getPullRequestMergeError,
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
    },
  };
}
