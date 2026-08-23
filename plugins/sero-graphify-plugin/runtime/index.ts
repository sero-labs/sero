import type { AppRuntime, AppRuntimeContext, AppRuntimeModule } from '@sero-ai/common';
import { GraphifyIndexer } from './indexer';
import { createIndexerHost } from './host-adapter';
import { latestPublishedVersion, GRAPHIFY_VERSION } from './provisioner';
import { DEFAULT_STATE, type GraphifyState } from '../shared/types';

/**
 * Note a newer graphifyy version. Never install it automatically.
 *
 * A new extractor version can invalidate cached work. The panel offers the
 * update, and the user decides when to rebuild each workspace.
 */
async function checkForUpgrade(ctx: AppRuntimeContext): Promise<void> {
  const latest = await latestPublishedVersion();
  if (!latest) return;
  // Against what is installed, not against the pin: after an accepted upgrade
  // the installed version has moved on, and comparing with the compile-time
  // constant would offer the same update for ever.
  const current = await ctx.host.appState.read<GraphifyState>(ctx.stateFilePath);
  const installed = current?.provisioning.version ?? GRAPHIFY_VERSION;
  // Strictly newer only. A yanked release can leave PyPI reporting a lower
  // version, and "updating" to it would downgrade the extractor.
  if (compareVersions(latest, installed) <= 0) return;
  await ctx.host.appState.update<GraphifyState>(ctx.stateFilePath, (current) => {
    const state = current ?? structuredClone(DEFAULT_STATE);
    return { ...state, provisioning: { ...state.provisioning, availableVersion: latest } };
  });
}

/** Numeric-segment comparison; returns >0 when `a` is newer than `b`. */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) => value.split('.').map((part) => Number.parseInt(part, 10) || 0);
  const left = parse(a);
  const right = parse(b);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export function createAppRuntime(ctx: AppRuntimeContext): AppRuntime {
  const { host } = createIndexerHost(ctx);
  const indexer = new GraphifyIndexer(host);
  return {
    start: async () => {
      await indexer.start();
      // Both are informational and must never block or fail startup.
      await checkForUpgrade(ctx).catch(() => undefined);
    },
    handleStateChange: (state) => indexer.handleStateChange(state),
    dispose: () => indexer.dispose(),
  };
}

const runtimeModule: AppRuntimeModule = { createAppRuntime };
export default runtimeModule;
