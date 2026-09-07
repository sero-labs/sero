import type { ArchitectIndex, ArchitectIndexEntry } from '../../shared/types';
import { OVERLAY_LABEL, usd } from './format';

export function widgetMeta(entry: ArchitectIndexEntry): string {
  const state = entry.overlay ? OVERLAY_LABEL[entry.overlay].toLowerCase() : entry.phase;
  const spend = entry.capUsd === null ? usd(entry.spentUsd) : `${usd(entry.spentUsd)}/${usd(entry.capUsd)}`;
  return `${state} · ${spend}`;
}

export function needsYouTotal(index: ArchitectIndex): number {
  return index.projects.reduce((total, entry) => total + entry.needsYou, 0);
}
