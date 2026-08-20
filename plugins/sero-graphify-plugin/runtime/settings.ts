import type { GraphifyNotice, SettingsPatch } from '../shared/types';
import type { IndexerHost } from './indexer';

/**
 * Configuration changes: settings the panel queued, and the library upgrade.
 *
 * Both are writes the runtime makes on the user's behalf rather than work it
 * queues, so they live away from the job queue.
 */

function notice(kind: GraphifyNotice['kind'], message: string): GraphifyNotice {
  return { kind, message, at: new Date().toISOString() };
}

/**
 * Merge a settings patch into state.
 *
 * The panel never writes the state file: the renderer persists its whole cached
 * snapshot, so a settings change landing just after a build would roll back the
 * spend ledger, the workspace statuses and the applied-request watermark. It
 * queues a patch and the runtime — the single writer — merges it here.
 */
export async function applySettingsPatch(host: IndexerHost, patch: SettingsPatch): Promise<void> {
  await host.updateState((state) => {
    const settings = { ...state.settings };
    if (patch.model !== undefined) settings.model = patch.model;
    if (patch.caps) settings.caps = { ...settings.caps, ...patch.caps };
    if (patch.paused !== undefined) settings.paused = patch.paused;
    if (patch.maxConcurrency !== undefined) settings.maxConcurrency = patch.maxConcurrency;
    if (patch.exclude) settings.exclude = patch.exclude;
    return { ...state, settings, notice: patch.clearNotice ? null : state.notice };
  });
}

/**
 * Install a newer graphifyy, once the user has said yes.
 *
 * A new extractor version invalidates the semantic cache, so the next build of
 * every workspace re-extracts and spends again. The dialog says so: this is the
 * one upgrade path that cannot be silent, and nothing is rebuilt afterwards
 * until the user asks.
 */
export async function upgradeGraphifyTool(host: IndexerHost): Promise<void> {
  const state = await host.readState();
  const version = state?.provisioning.availableVersion;
  if (!version) return;
  const approved = await host.confirm({
    title: `Update graphify to ${version}?`,
    body: [
      `Installed: ${state?.provisioning.version ?? 'unknown'} · Available: ${version}`,
      'A new extractor version invalidates the cached extractions, so the next build of each workspace pays full price again.',
      'Nothing is re-indexed now — each workspace waits until you rebuild it.',
    ].join('\n'),
    confirmLabel: 'Update graphify',
  });
  if (!approved) return;
  try {
    await host.upgradeGraphify(version);
    host.notify(notice('info', `graphify updated to ${version}. Rebuild a workspace when you want its graph refreshed.`));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    host.notify(notice('refused', `Updating graphify failed: ${message}`));
  }
}
