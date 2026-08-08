/**
 * ExplorerViewMount, loads and mounts an app's federated Explorer view
 * contributed to `ui.explorer.view`.
 *
 * Mirrors SearchContributionMount: the host contributes the slot, the plugin
 * contributes what goes in it (AD-025). A contributed view fills the whole
 * Explorer area — the host sidebar is hidden while one is active — and it
 * unmounts when you switch away, so the plugin keeps its own view state.
 */

import { Spinner } from '@sero-ai/ui/components/ui/spinner';
import type { ResolvedContribution } from '@/stores/app';
import { FederatedContributionMount } from '@/components/apps/FederatedContributionMount';

export function ExplorerViewMount({
  resolved,
}: {
  resolved: ResolvedContribution<'ui.explorer.view'>;
}) {
  return (
    <FederatedContributionMount
      manifest={resolved.manifest}
      contribution={resolved.contribution}
      contributionKey={resolved.key}
      loading={<ExplorerViewLoading />}
      unavailable={<ExplorerViewMessage message={`${resolved.manifest.name} view unavailable`} />}
      missingWorkspace={<ExplorerViewMessage message="No workspace selected" />}
    />
  );
}

/**
 * Shown when the active panel is a contributed view whose plugin isn't
 * installed or is currently unsupported. The panel id is kept either way, so
 * the view returns as soon as the plugin does.
 */
export function ExplorerViewMissing({ panelId }: { panelId: string }) {
  return <ExplorerViewMessage message={`The "${panelId}" view isn't available`} />;
}

function ExplorerViewMessage({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
      {message}
    </div>
  );
}

function ExplorerViewLoading() {
  return (
    <div role="status" className="flex h-full items-center justify-center gap-2">
      <Spinner className="size-4 text-[var(--text-muted)]" />
      <span className="text-xs text-[var(--text-muted)]">Loading view</span>
    </div>
  );
}
