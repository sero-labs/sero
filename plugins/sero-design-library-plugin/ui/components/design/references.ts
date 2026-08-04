import type { ItemSummary } from '../../../shared/types';

/**
 * The references a Design drew on, as the inspector needs them.
 *
 * A Design keeps working when a reference is deleted — the output already exists —
 * so a missing item becomes a named absence rather than a gap in the list. What it
 * was made from is provenance, and provenance that quietly shortens is worse than
 * none.
 */

export interface DesignReferenceView {
  id: string;
  title: string;
  primaryStyle: string;
  tags: string[];
  /** The Library item has been deleted; the Design still remembers it. */
  missing: boolean;
}

export function referenceViews(
  referenceItemIds: string[],
  items: ItemSummary[],
): DesignReferenceView[] {
  return referenceItemIds.map((id) => {
    const item = items.find((entry) => entry.id === id);
    return item === undefined
      ? { id, title: 'Deleted reference', primaryStyle: '', tags: [], missing: true }
      : {
          id,
          title: item.title,
          primaryStyle: item.primaryStyle,
          tags: item.tags,
          missing: false,
        };
  });
}
