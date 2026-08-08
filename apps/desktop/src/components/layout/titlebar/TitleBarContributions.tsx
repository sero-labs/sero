/**
 * TitleBarContributions, the title bar's plugin slot.
 *
 * The host contributes the placement; plugins contribute the controls
 * (AD-025). Renders nothing when no installed app declares
 * `ui.titlebar.control`.
 */

import { getContributions, useAppStore } from '@/stores/app';
import { TitleBarContributionMount } from './TitleBarContributionMount';

export function TitleBarContributions() {
  const apps = useAppStore((s) => s.apps);
  const contributions = getContributions(apps, 'ui.titlebar.control');
  if (contributions.length === 0) return null;

  return (
    <>
      {contributions.map((resolved) => (
        <TitleBarContributionMount key={resolved.key} resolved={resolved} />
      ))}
    </>
  );
}
