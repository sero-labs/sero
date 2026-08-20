import type { AppRuntime, AppRuntimeContext, AppRuntimeModule } from '@sero-ai/common';
import { GraphifyIndexer } from './indexer';
import { createIndexerHost } from './host-adapter';
import { latestPublishedVersion, GRAPHIFY_VERSION } from './provisioner';
import { DEFAULT_STATE, type GraphifyBackend, type GraphifyState } from '../shared/types';

/** Sero provider ids mapped onto graphify's backend names. */
const PROVIDER_BACKENDS: Record<string, GraphifyBackend> = {
  anthropic: 'claude',
  openai: 'openai',
  google: 'gemini',
  deepseek: 'deepseek',
  moonshotai: 'kimi',
  ollama: 'ollama',
};

/**
 * Cache the models the user actually has into state, so the panel's picker
 * offers real choices instead of a list Sero was shipped with. A model added
 * to Sero after this release still appears.
 */
async function cacheAvailableModels(ctx: AppRuntimeContext): Promise<void> {
  const groups = await ctx.host.models.list().catch(() => []);
  const available = groups.flatMap((group) => {
    const backend = PROVIDER_BACKENDS[group.provider];
    if (!backend) return [];
    return group.models.map((model) => ({ backend, modelId: model.modelId, label: `${group.displayName} · ${model.name}` }));
  });
  await ctx.host.appState.update<GraphifyState>(ctx.stateFilePath, (current) => ({
    ...(current ?? structuredClone(DEFAULT_STATE)),
    availableModels: available,
  }));
}

/**
 * Note a newer graphifyy, never install it.
 *
 * A new extractor version invalidates the semantic cache, so applying an
 * upgrade re-extracts the corpus and spends money. That makes an automatic
 * upgrade unacceptable; the panel offers it and the user decides.
 */
async function checkForUpgrade(ctx: AppRuntimeContext): Promise<void> {
  const latest = await latestPublishedVersion();
  if (!latest) return;
  // Against what is installed, not against the pin: after an accepted upgrade
  // the installed version has moved on, and comparing with the compile-time
  // constant would offer the same update for ever.
  const current = await ctx.host.appState.read<GraphifyState>(ctx.stateFilePath);
  const installed = current?.provisioning.version ?? GRAPHIFY_VERSION;
  if (latest === installed) return;
  await ctx.host.appState.update<GraphifyState>(ctx.stateFilePath, (current) => {
    const state = current ?? structuredClone(DEFAULT_STATE);
    return { ...state, provisioning: { ...state.provisioning, availableVersion: latest } };
  });
}

export function createAppRuntime(ctx: AppRuntimeContext): AppRuntime {
  const { host } = createIndexerHost(ctx);
  const indexer = new GraphifyIndexer(host);
  return {
    start: async () => {
      await indexer.start();
      // Both are informational and must never block or fail startup.
      await Promise.all([
        cacheAvailableModels(ctx).catch(() => undefined),
        checkForUpgrade(ctx).catch(() => undefined),
      ]);
    },
    handleStateChange: (state) => indexer.handleStateChange(state),
    dispose: () => indexer.dispose(),
  };
}

const runtimeModule: AppRuntimeModule = { createAppRuntime };
export default runtimeModule;
