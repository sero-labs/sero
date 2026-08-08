/**
 * TitleBarContributionMount, loads and mounts an app's federated title-bar
 * control contributed to `ui.titlebar.control`.
 *
 * The plugin owns the whole control — trigger and popover both. That works
 * because `@sero-ai/ui`'s Popover portals into the container `PluginStyleScope`
 * provides, so the plugin's own popover stays inside its style scope instead of
 * landing unscoped on `document.body`.
 *
 * Renders nothing while loading or on failure: the title bar is chrome, and an
 * error message wedged between the window controls is worse than a gap.
 */

import type { ResolvedContribution } from '@/stores/app';
import { FederatedContributionMount } from '@/components/apps/FederatedContributionMount';

export function TitleBarContributionMount({
  resolved,
}: {
  resolved: ResolvedContribution<'ui.titlebar.control'>;
}) {
  return (
    <FederatedContributionMount
      manifest={resolved.manifest}
      contribution={resolved.contribution}
      contributionKey={resolved.key}
      loading={null}
      unavailable={null}
    />
  );
}
