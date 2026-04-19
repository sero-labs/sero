import type { KanbanRuntimeHost } from '../types';
import type { Card, KanbanState } from './types';

export interface PersistedCardFix {
  id: string;
  update: Partial<Card>;
}

export async function collectPersistedCardFixes(
  host: Pick<KanbanRuntimeHost, 'git'>,
  state: KanbanState | null,
): Promise<PersistedCardFix[]> {
  if (!state?.cards?.length) return [];

  const fixes: PersistedCardFix[] = [];

  for (const card of state.cards) {
    if (
      card.column === 'review'
      && card.status === 'waiting-input'
      && card.prUrl
      && isMalformedReviewError(card.error)
    ) {
      fixes.push({ id: card.id, update: { error: undefined } });
    }

    if (card.column !== 'done' || !card.prNumber || !card.worktreePath) continue;
    const mergeError = await host.git.getPrMergeError(card.worktreePath, card.prNumber);
    if (!mergeError) continue;
    fixes.push({
      id: card.id,
      update: {
        column: 'review',
        status: 'waiting-input',
        completedAt: undefined,
        error: mergeError,
      },
    });
  }

  for (const card of state.cards) {
    if (card.column === 'done' && (card.previewUrl || card.previewServerId)) {
      fixes.push({
        id: card.id,
        update: { previewUrl: undefined, previewServerId: undefined },
      });
    }
  }

  return fixes;
}

function isMalformedReviewError(error: string | undefined): boolean {
  if (!error) return false;
  return error.includes('[object Object]') || /verdict[:\s`*-]+(merge|fix-first|reject)/i.test(error);
}
