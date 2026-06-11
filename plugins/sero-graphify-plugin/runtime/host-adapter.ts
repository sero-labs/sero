import path from 'node:path';
import type { AppRuntimeContext } from '@sero-ai/common';
import type { GraphifyState } from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { graphifyPathsFromHome, workspaceGraphDir, workspaceGraphJson, type GraphifyPaths } from '../shared/paths';
import { boundedExec } from './bounded-exec';
import { provisionGraphify, graphifyBinPath, uvEnv } from './provisioner';
import { buildWorkspaceGraph, updateWorkspaceGraph, mergeProfileGraph as runMerge } from './graphify-runner';
import { extractionEnv } from './credentials';
import { graphStats, loadGraph } from '../shared/query-engine';
import type { WorkspaceIndexStats } from '../shared/types';
import type { IndexerHost } from './indexer';

export function createIndexerHost(ctx: AppRuntimeContext): { host: IndexerHost; paths: GraphifyPaths } {
  const paths = graphifyPathsFromHome(path.dirname(ctx.stateFilePath));
  let provisioned: { graphifyPath: string } | null = null;
  let provisioningPromise: Promise<void> | null = null;

  // Tool installs (uv-managed Python + graphifyy venv) are machine-shared,
  // NOT per-profile — graph artifacts stay per-profile, binaries don't.
  let cachedToolsDir: string | null = null;
  const toolsDir = async (): Promise<string> => {
    cachedToolsDir ??= (await ctx.host.toolchains.sharedToolsDir('graphify')).path;
    return cachedToolsDir;
  };

  const readState = async () => (await ctx.host.appState.read<GraphifyState>(ctx.stateFilePath)) ?? null;
  const updateState = (updater: (current: GraphifyState) => GraphifyState) =>
    ctx.host.appState.update<GraphifyState>(ctx.stateFilePath, (current) => updater(current ?? structuredClone(DEFAULT_STATE)));

  const ensureProvisioned = async (): Promise<void> => {
    if (provisioned) return;
    if (provisioningPromise) return provisioningPromise;
    provisioningPromise = provisionGraphifyOnce().finally(() => {
      provisioningPromise = null;
    });
    return provisioningPromise;
  };

  const provisionGraphifyOnce = async (): Promise<void> => {
    await updateState((state) => ({ ...state, provisioning: { ...state.provisioning, status: 'installing', updatedAt: new Date().toISOString() } }));
    try {
      const result = await provisionGraphify({
        ensureUv: async () => (await ctx.host.toolchains.ensure('uv')).path,
        exec: boundedExec,
        toolsDir: await toolsDir(),
      });
      provisioned = result;
      await updateState((state) => ({
        ...state,
        provisioning: { status: 'ready', uvPath: result.uvPath, graphifyPath: result.graphifyPath, version: result.version, updatedAt: new Date().toISOString() },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateState((state) => ({ ...state, provisioning: { status: 'failed', error: message, updatedAt: new Date().toISOString() } }));
      throw error;
    }
  };

  const resolvedGraphifyPath = async () => provisioned?.graphifyPath ?? graphifyBinPath(await toolsDir());

  // Extraction needs the backend's API key in env; merges are local-only and must
  // not fail when no key is configured, so they get the bare uv env.
  const extractionDeps = async (settings: GraphifyState['settings']) => ({
    exec: boundedExec,
    graphifyPath: await resolvedGraphifyPath(),
    env: await extractionEnv(settings.backend, (providerId) => ctx.host.credentials.getProviderApiKey(providerId), uvEnv(await toolsDir())),
  });

  const localDeps = async () => ({
    exec: boundedExec,
    graphifyPath: await resolvedGraphifyPath(),
    env: uvEnv(await toolsDir()),
  });

  // Stdout stat lines are best-effort (a no-change update prints none at all);
  // the graph file is the source of truth for structural counts.
  const withAuthoritativeStats = async (workspaceId: string, stats: WorkspaceIndexStats): Promise<WorkspaceIndexStats> => {
    const graph = await loadGraph(workspaceGraphJson(paths, workspaceId));
    return graph ? { ...stats, ...graphStats(graph) } : stats;
  };

  const host: IndexerHost = {
    readState,
    updateState,
    listWorkspaces: () => ctx.host.workspace.list(),
    ensureProvisioned,
    buildGraph: async (workspace, settings, onProgress) =>
      withAuthoritativeStats(workspace.workspaceId, await buildWorkspaceGraph(await extractionDeps(settings), {
        workspaceDir: workspaceGraphDir(paths, workspace.workspaceId),
        inputPath: workspace.path,
        backend: settings.backend,
        model: settings.model,
        tokenBudget: settings.tokenBudget,
        exclude: settings.exclude,
        onProgress,
      })),
    updateGraph: async (workspace, settings, onProgress) =>
      // `graphify update` is AST-only (no LLM), so no credentials needed.
      withAuthoritativeStats(workspace.workspaceId, await updateWorkspaceGraph(await localDeps(), {
        workspaceDir: workspaceGraphDir(paths, workspace.workspaceId),
        inputPath: workspace.path,
        backend: settings.backend,
        model: settings.model,
        tokenBudget: settings.tokenBudget,
        exclude: settings.exclude,
        onProgress,
      })),
    mergeProfileGraph: async (workspaceIds) => {
      await runMerge(await localDeps(), workspaceIds.map((id) => workspaceGraphJson(paths, id)), paths.profileGraph);
      const merged = await loadGraph(paths.profileGraph);
      return { nodes: merged?.nodes.size ?? 0, edges: merged?.edgeCount ?? 0 };
    },
    log: (message) => console.log(message),
  };

  return { host, paths };
}
