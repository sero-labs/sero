import { useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { ComponentExtensionPointId } from '@sero-ai/common';
import {
  AppContext,
  type ContributedComponentDescriptor,
  type ContributionMountOptions,
} from './context';

export interface UseAppContributionSlotResult {
  status: 'available' | 'unavailable';
  contributions: readonly ContributedComponentDescriptor[];
  mount: (key: string, options: ContributionMountOptions) => ReactNode;
}

const NO_CONTRIBUTIONS: readonly ContributedComponentDescriptor[] = [];

/** List and mount host-owned federated components without exposing host internals. */
export function useAppContributionSlot(
  extensionPoint: ComponentExtensionPointId,
): UseAppContributionSlotResult {
  const slots = useContext(AppContext)?.contributionSlots;
  const contributions = useMemo(
    () => slots?.components.filter((entry) => entry.extensionPoint === extensionPoint)
      ?? NO_CONTRIBUTIONS,
    [extensionPoint, slots?.components],
  );

  if (!slots) {
    return {
      status: 'unavailable',
      contributions,
      mount: (_key, options) => options.unavailable,
    };
  }

  return { status: 'available', contributions, mount: slots.mount };
}
