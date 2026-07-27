import { useAppTools } from '@sero-ai/app-runtime';
import { useEffect, useState } from 'react';

import type { LibrarianField, LibrarianUserFacingAnalysis } from '../../shared/librarian';

/**
 * The full analysis behind one item.
 *
 * Summaries are deliberately thin, so the inspector asks for the record. It
 * refetches whenever the state revision moves, which is how an edit applied by
 * the runtime finds its way back into the open panel.
 */

export interface ItemDetail {
  id: string;
  analysis: LibrarianUserFacingAnalysis;
  /** Fields carrying a user override, so the panel can offer Reset on them. */
  overridden: LibrarianField[];
  /** The Librarian's own confidence, 0–1. */
  confidence: number;
  updatedAt: number;
  /** Facts about the file itself, for the preview pane's footer. */
  createdAt: number;
  fileName: string;
  width: number;
  height: number;
  bytes: number;
}

interface DetailPayload {
  item?: Record<string, unknown>;
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function parse(details: unknown): ItemDetail | null {
  const item = (details as DetailPayload | undefined)?.item;
  if (!item || typeof item.id !== 'string' || typeof item.analysis !== 'object' || item.analysis === null) {
    return null;
  }
  return {
    id: item.id,
    analysis: item.analysis as LibrarianUserFacingAnalysis,
    overridden: Array.isArray(item.overridden) ? (item.overridden as LibrarianField[]) : [],
    confidence: num(item.confidence),
    updatedAt: num(item.updatedAt),
    createdAt: num(item.createdAt),
    fileName: typeof item.fileName === 'string' ? item.fileName : '',
    width: num(item.width),
    height: num(item.height),
    bytes: num(item.bytes),
  };
}

export function useItemDetail(itemId: string | undefined, revision: number): ItemDetail | null {
  const tools = useAppTools();
  const [detail, setDetail] = useState<ItemDetail | null>(null);

  useEffect(() => {
    if (itemId === undefined) {
      setDetail(null);
      return;
    }
    let active = true;
    void tools
      .run('design_library_items', { action: 'get', itemId })
      .then((result) => {
        if (active) setDetail(parse(result.details));
      })
      .catch(() => {
        if (active) setDetail(null);
      });
    return () => {
      active = false;
    };
  }, [itemId, revision, tools]);

  return detail;
}
