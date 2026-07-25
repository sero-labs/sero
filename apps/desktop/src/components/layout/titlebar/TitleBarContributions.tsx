/**
 * TitleBarContributions, the title bar's plugin slot.
 *
 * The host contributes the placement; plugins contribute the controls
 * (AD-025). Renders nothing when no installed app declares
 * `sero.app.titlebar`.
 */

import { getTitleBarContributionApps, useAppStore } from '@/stores/app';
import { TitleBarContributionMount } from './TitleBarContributionMount';

export function TitleBarContributions() {
  const apps = useAppStore((s) => s.apps);
  const contributions = getTitleBarContributionApps(apps);
  if (contributions.length === 0) return null;

  return (
    <>
      {contributions.map((app) => (
        <TitleBarContributionMount key={app.id} manifest={app.manifest!} />
      ))}
    </>
  );
}
