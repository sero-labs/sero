/**
 * SearchContributionMount, loads and mounts an app's federated global-search
 * panel contributed to `ui.global-search.panel`.
 *
 * Mirrors WidgetMount: wraps the federated component in AppProvider so the
 * panel has full access to useAppState, useAppTools, and the other
 * app-runtime hooks — the search logic itself stays inside the plugin.
 */

import { Spinner } from '@sero-ai/ui/components/ui/spinner';
import type { ResolvedContribution } from '@/stores/app';
import { FederatedContributionMount } from '@/components/apps/FederatedContributionMount';

export function SearchContributionMount({
  resolved,
}: {
  resolved: ResolvedContribution<'ui.global-search.panel'>;
}) {
  return (
    <FederatedContributionMount
      manifest={resolved.manifest}
      contribution={resolved.contribution}
      contributionKey={resolved.key}
      loading={<SearchPanelLoading />}
      unavailable={<SearchPanelFallback message="Search panel unavailable" />}
      missingWorkspace={<SearchPanelFallback message="No workspace selected" />}
    />
  );
}

function SearchPanelFallback({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
      {message}
    </div>
  );
}

function SearchPanelLoading() {
  return (
    <div role="status" className="flex h-full items-center justify-center gap-2">
      <Spinner className="size-4 text-[var(--text-muted)]" />
      <span className="text-xs text-[var(--text-muted)]">Loading search</span>
    </div>
  );
}
