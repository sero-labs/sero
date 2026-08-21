import path from 'node:path';
import { access, readdir, rm } from 'node:fs/promises';
import type { AppRuntimeContext } from '@sero-ai/common';
import type { GraphifyNotice, GraphifyState } from '../shared/types';
import { withStateDefaults } from '../shared/types';
import { graphifyPathsFromHome, workspaceGraphDir, workspaceGraphJson, type GraphifyPaths } from '../shared/paths';
import { boundedExec } from './bounded-exec';
import { provisionGraphify, graphifyBinPath, uvEnv, GRAPHIFY_VERSION } from './provisioner';
import { buildWorkspaceGraph, mergeProfileGraph as runMerge, type BuildOutcome } from './graphify-runner';
import { cleanEnv } from './credentials';
import { graphStats, loadGraph } from '../shared/query-engine';
import type { IndexerHost } from './indexer';

const CONFIRMATION_TIMEOUT_MS = 120_000;

export function createIndexerHost(ctx: AppRuntimeContext): { host: IndexerHost; paths: GraphifyPaths } {
  const paths = graphifyPathsFromHome(path.dirname(ctx.stateFilePath));
  let provisioned: { graphifyPath: string; version: string } | null = null;
  let provisioningPromise: Promise<void> | null = null;

  // Tool installs (uv-managed Python + graphifyy venv) are machine-shared,
  // NOT per-profile — graph artifacts stay per-profile, binaries don't.
  let cachedToolsDir: string | null = null;
  const toolsDir = async (): Promise<string> => {
    cachedToolsDir ??= (await ctx.host.toolchains.sharedToolsDir('graphify')).path;
    return cachedToolsDir;
  };

  // Every read goes through withStateDefaults so paid-build state from an older
  // release becomes the current local indexing shape.
  const readState = async () => withStateDefaults(await ctx.host.appState.read<GraphifyState>(ctx.stateFilePath));
  const updateState = (updater: (current: GraphifyState) => GraphifyState) =>
    ctx.host.appState.update<GraphifyState>(ctx.stateFilePath, (current) => updater(withStateDefaults(current)));

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
        // uv and graphify never need the whole Electron environment; see cleanEnv.
        baseEnv: cleanEnv(process.env),
      });
      provisioned = result;
      await updateState((state) => ({
        ...state,
        provisioning: { ...state.provisioning, status: 'ready', uvPath: result.uvPath, graphifyPath: result.graphifyPath, version: result.version, error: undefined, updatedAt: new Date().toISOString() },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await updateState((state) => ({ ...state, provisioning: { ...state.provisioning, status: 'failed', error: message, updatedAt: new Date().toISOString() } }));
      throw error;
    }
  };

  const resolvedGraphifyPath = async () => provisioned?.graphifyPath ?? graphifyBinPath(await toolsDir());

  const localDeps = async () => {
    const tools = await toolsDir();
    return {
      exec: boundedExec,
      graphifyPath: await resolvedGraphifyPath(),
      // No provider keys, AWS settings, Ollama endpoint, or Claude CLI backend.
      // Graphify can only perform local AST, clustering, and export work.
      env: uvEnv(tools, cleanEnv(process.env)),
    };
  };

  const buildOptionsFor = (workspace: { workspaceId: string; path: string }, settings: GraphifyState['settings']) => ({
    workspaceDir: workspaceGraphDir(paths, workspace.workspaceId),
    inputPath: workspace.path,
    exclude: settings.exclude,
  });

  // Stdout stat lines are best-effort (a no-change update prints none at all);
  // the graph file is the source of truth for structural counts. Token usage is
  // NOT overwritten here: `usageMeasured` says whether it was reported at all,
  // and the graph file cannot answer that.
  const withAuthoritativeStats = async (workspaceId: string, outcome: BuildOutcome): Promise<BuildOutcome> => {
    const graph = await loadGraph(workspaceGraphJson(paths, workspaceId));
    return graph ? { ...outcome, stats: { ...outcome.stats, ...graphStats(graph) } } : outcome;
  };

  const host: IndexerHost = {
    readState,
    updateState,
    listWorkspaces: () => ctx.host.workspace.list(),
    ensureProvisioned,
    graphExists: (workspaceId) =>
      access(workspaceGraphJson(paths, workspaceId)).then(() => true).catch(() => false),
    graphifyVersion: async () => provisioned?.version ?? (await readState())?.provisioning.version ?? GRAPHIFY_VERSION,
    upgradeGraphify: async (version) => {
      const result = await provisionGraphify({
        ensureUv: async () => (await ctx.host.toolchains.ensure('uv')).path,
        exec: boundedExec,
        toolsDir: await toolsDir(),
        baseEnv: cleanEnv(process.env),
        version,
      });
      provisioned = result;
      await updateState((state) => ({
        ...state,
        provisioning: { ...state.provisioning, status: 'ready', graphifyPath: result.graphifyPath, version: result.version, availableVersion: undefined, error: undefined, updatedAt: new Date().toISOString() },
      }));
    },
    confirm: async ({ title, body, confirmLabel }) => {
      const outcome = await ctx.host.notifications.requestChoice({
        title,
        body,
        choices: [
          { id: 'confirm', label: confirmLabel, emphasis: 'primary' },
          { id: 'skip', label: 'Cancel' },
        ],
        timeoutMs: CONFIRMATION_TIMEOUT_MS,
        openTarget: { appId: 'graphify' },
      });
      // Silence is a no for toolchain upgrades.
      return outcome.choiceId === 'confirm';
    },
    notify: (notice: GraphifyNotice) =>
      ctx.host.notifications.notify({
        message: notice.message,
        type: notice.kind === 'info' ? 'info' : 'warning',
        source: 'Graphify',
        openTarget: { appId: 'graphify' },
      }),
    buildGraph: async (workspace, settings, hooks) =>
      withAuthoritativeStats(workspace.workspaceId, await buildWorkspaceGraph(await localDeps(), {
        ...buildOptionsFor(workspace, settings),
        onProgress: hooks.onProgress,
      })),
    updateGraph: async (workspace, settings, hooks) =>
      // Use the cached code-only extraction path for refreshes too. Graphify's
      // `update` command can add document AST nodes that a rebuild removes.
      withAuthoritativeStats(workspace.workspaceId, await buildWorkspaceGraph(await localDeps(), {
        ...buildOptionsFor(workspace, settings),
        onProgress: hooks.onProgress,
      })),
    mergeProfileGraph: async (workspaceIds) => {
      await runMerge(await localDeps(), workspaceIds.map((id) => workspaceGraphJson(paths, id)), paths.profileGraph);
      const merged = await loadGraph(paths.profileGraph);
      return { nodes: merged?.nodes.size ?? 0, edges: merged?.edgeCount ?? 0 };
    },
    removeWorkspaceArtifacts: (workspaceId) =>
      rm(workspaceGraphDir(paths, workspaceId), { recursive: true, force: true }),
    listArtifactWorkspaceIds: async () => {
      const entries = await readdir(paths.graphsDir, { withFileTypes: true }).catch(() => []);
      return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    },
    log: (message) => console.log(message),
  };

  return { host, paths };
}
