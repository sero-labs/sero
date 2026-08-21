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
 * workspace statuses and the applied-request watermark. It
 * queues a patch and the runtime — the single writer — merges it here.
 */
export async function applySettingsPatch(host: IndexerHost, patch: SettingsPatch): Promise<void> {
  await host.updateState((state) => {
    const settings = { ...state.settings };
    if (patch.paused !== undefined) settings.paused = patch.paused;
    if (patch.exclude) settings.exclude = patch.exclude;
    return { ...state, settings, notice: patch.clearNotice ? null : state.notice };
  });
}

/**
 * Install a newer graphifyy, once the user has said yes.
 *
 * A new extractor version can invalidate cached AST work. Nothing is rebuilt
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
      'A new extractor version can invalidate cached extraction work, so each workspace might need a full local rebuild.',
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
