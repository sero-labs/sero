import type {
  ContributedComponentDescriptor,
} from '@sero-ai/app-runtime';
import type { ComponentContribution } from '@sero-ai/common';
import type { AppEntry, ResolvedContribution } from '@/stores/app';
import { getContributions } from '@/stores/app';

const COMPONENT_EXTENSION_POINTS = [
  'ui.global-search.panel',
  'ui.explorer.view',
  'ui.titlebar.control',
  'ui.chat.model-extension',
  'ui.admin.model-settings',
  'ui.dashboard.widget',
] as const;

export interface ResolvedComponentSlot {
  descriptor: ContributedComponentDescriptor;
  resolved: ResolvedContribution<(typeof COMPONENT_EXTENSION_POINTS)[number]>;
}

function contributionName(contribution: ComponentContribution, app: AppEntry): string {
  if ('name' in contribution) return contribution.name;
  if ('label' in contribution && contribution.label) return contribution.label;
  return app.label;
}

export function getResolvedComponentSlots(apps: AppEntry[]): ResolvedComponentSlot[] {
  const slots: ResolvedComponentSlot[] = [];
  for (const extensionPoint of COMPONENT_EXTENSION_POINTS) {
    for (const resolved of getContributions(apps, extensionPoint)) {
      const contribution = resolved.contribution;
      slots.push({
        resolved,
        descriptor: {
          key: resolved.key,
          extensionPoint,
          name: contributionName(contribution, resolved.app),
          description: 'description' in contribution ? contribution.description : undefined,
          icon: 'icon' in contribution ? contribution.icon : undefined,
          contributorAppId: resolved.appId,
          contributorAppName: resolved.app.label,
        },
      });
    }
  }
  return slots.sort((left, right) => (
    left.descriptor.name.localeCompare(right.descriptor.name)
    || left.descriptor.key.localeCompare(right.descriptor.key)
  ));
}
