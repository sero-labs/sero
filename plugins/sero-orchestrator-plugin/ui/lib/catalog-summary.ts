/**
 * Pure display helpers for the Catalog tab (the trigger-summary.ts pattern —
 * testable without rendering).
 */

import type { CatalogEntryMeta } from '../../shared/catalog-types';
import { deliveryDestinationInfo } from '../../shared/delivery-types';
import type { LibraryIndex, Loop } from '../../shared/types';

export interface CatalogChip {
  label: string;
  title?: string;
}

/** The metadata chips on an entry card, in display order. */
export function entryChips(meta: CatalogEntryMeta): CatalogChip[] {
  const chips: CatalogChip[] = [];
  if (meta.recommendedTrigger) chips.push({ label: meta.recommendedTrigger, title: 'When it runs' });
  if (meta.delivery) chips.push({ label: `→ ${deliveryDestinationInfo(meta.delivery).label}`, title: 'Where results ship' });
  if (meta.costBand) chips.push({ label: `${meta.costBand} cost` });
  if (meta.modelTier) chips.push({ label: meta.modelTier, title: 'Model tier' });
  for (const connector of meta.connectors ?? []) chips.push({ label: connector, title: 'Needs this connector' });
  return chips;
}

export type CatalogInstallState =
  | { state: 'not-installed' }
  | { state: 'installed'; entryId: string; entryName: string }
  | { state: 'update-available'; entryId: string; entryName: string; installedCatalogVersion: number };

/** How a catalog entry relates to the library, straight off the watched index. */
export function installState(repoKey: string, meta: CatalogEntryMeta, index: LibraryIndex): CatalogInstallState {
  const owned = index.entries.find((e) => e.catalog?.repoKey === repoKey && e.catalog?.slug === meta.slug);
  if (!owned?.catalog) return { state: 'not-installed' };
  if (owned.catalog.catalogVersion >= meta.version) return { state: 'installed', entryId: owned.id, entryName: owned.name };
  return {
    state: 'update-available',
    entryId: owned.id,
    entryName: owned.name,
    installedCatalogVersion: owned.catalog.catalogVersion,
  };
}

/**
 * The refine request behind "Update & re-adapt" on a catalog loop: a version
 * switch lands the new curated plan verbatim (deterministic, FR-L4), so this
 * asks the model to re-specialize it, carrying the concrete values the user
 * gave when the loop was first adapted. Model-authored, code-validated — the
 * normal revise path does the rest.
 */
export function readaptPrompt(loop: Loop): string {
  const pairs: string[] = [];
  for (const answered of loop.answeredInputs ?? []) {
    if (answered.source !== 'planner') continue;
    for (const q of answered.questions) {
      const answer = answered.answers.find((a) => a.questionId === q.id);
      const picked = answer?.choiceId ? q.choices?.find((c) => c.id === answer.choiceId)?.label : undefined;
      const text = [picked, answer?.text?.trim()].filter(Boolean).join(' — ');
      if (text) pairs.push(`- ${q.prompt}: ${text}`);
    }
  }
  return [
    'This Workflow just switched to a newer curated catalog version, which may still contain generic placeholders ("your repo", "your team channel").',
    'Re-adapt the plan to this workspace: replace generic placeholders with the concrete values this Workflow already uses, and keep the new version\'s structure and intent unchanged.',
    pairs.length > 0 ? `The user answered these questions when the Workflow was set up:\n${pairs.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}
