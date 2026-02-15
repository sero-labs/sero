/**
 * Model selector constants and helpers.
 *
 * The available models come from the backend (PI SDK ModelRegistry).
 * This file only holds thinking-level display info and lookup helpers.
 */

import type { ModelInfo, AvailableModelGroup } from '@/types/ipc';

/** All thinking levels in order. */
export const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

/** Display labels for thinking levels. */
export const THINKING_LABELS: Record<string, string> = {
  off: 'Off',
  minimal: 'Min',
  low: 'Low',
  medium: 'Med',
  high: 'High',
  xhigh: 'Max',
};

/** Find a model across all groups that matches provider+modelId. */
export function findModel(
  groups: AvailableModelGroup[],
  provider: string,
  modelId: string,
): ModelInfo | undefined {
  for (const g of groups) {
    const m = g.models.find((m) => m.provider === provider && m.modelId === modelId);
    if (m) return m;
  }
  return undefined;
}

/** Find the group that contains a given provider+modelId. */
export function findGroup(
  groups: AvailableModelGroup[],
  provider: string,
  modelId: string,
): AvailableModelGroup | undefined {
  for (const g of groups) {
    if (g.models.some((m) => m.provider === provider && m.modelId === modelId)) return g;
  }
  return undefined;
}
