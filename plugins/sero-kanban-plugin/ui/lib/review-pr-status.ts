import type { Card } from '../../shared/types';

export type ReviewPrState = 'awaiting-merge' | 'open' | 'closed' | 'unknown' | 'auto-merge-pending';

interface ReviewPrStatus {
  state: ReviewPrState;
  title: string;
  description: string;
  actionLabel: string;
  primaryActionDisabled?: boolean;
  tone: {
    border: string;
    background: string;
    accent: string;
    text: string;
    buttonBackground: string;
    buttonText: string;
  };
}

const OPEN_MESSAGE = /(still open|awaiting review)/i;
const CLOSED_MESSAGE = /closed without merging/i;
const UNKNOWN_MESSAGE = /could not verify whether pr/i;
const AUTO_MERGE_PENDING_MESSAGE = /auto-merge pending/i;

export function getReviewPrStatus(card: Pick<Card, 'prNumber' | 'error'>): ReviewPrStatus {
  const prLabel = card.prNumber ? `PR #${card.prNumber}` : 'PR';

  if (card.error && OPEN_MESSAGE.test(card.error)) {
    return {
      state: 'open',
      title: 'Awaiting Review',
      description: 'Merge this pull request on GitHub, then confirm it here to move the card to Done.',
      actionLabel: 'Confirm PR Merged',
      tone: {
        border: 'rgba(245, 158, 11, 0.24)',
        background: 'rgba(245, 158, 11, 0.06)',
        accent: '#f59e0b',
        text: '#fcd34d',
        buttonBackground: '#f59e0b',
        buttonText: '#0f1117',
      },
    };
  }

  if (card.error && AUTO_MERGE_PENDING_MESSAGE.test(card.error)) {
    return {
      state: 'auto-merge-pending',
      title: 'Auto-Merge Pending',
      description: 'GitHub auto-merge is queued for this PR. The card will finish automatically once GitHub merges it.',
      actionLabel: 'Waiting for GitHub',
      primaryActionDisabled: true,
      tone: {
        border: 'rgba(129, 140, 248, 0.24)',
        background: 'rgba(129, 140, 248, 0.06)',
        accent: '#818cf8',
        text: '#c7d2fe',
        buttonBackground: 'rgba(129, 140, 248, 0.16)',
        buttonText: '#a5b4fc',
      },
    };
  }

  if (card.error && CLOSED_MESSAGE.test(card.error)) {
    return {
      state: 'closed',
      title: `${prLabel} closed without merge`,
      description: 'This pull request was closed without being merged. Re-open it or create a replacement PR before finishing the card.',
      actionLabel: 'Confirm PR Merged',
      tone: {
        border: 'rgba(248, 113, 113, 0.24)',
        background: 'rgba(248, 113, 113, 0.05)',
        accent: '#f87171',
        text: '#fca5a5',
        buttonBackground: '#f87171',
        buttonText: '#0f1117',
      },
    };
  }

  if (card.error && UNKNOWN_MESSAGE.test(card.error)) {
    return {
      state: 'unknown',
      title: `${prLabel} merge status unknown`,
      description: 'Sero could not confirm the GitHub merge state. Recheck once GitHub is reachable and the PR is merged.',
      actionLabel: 'Confirm PR Merged',
      tone: {
        border: 'rgba(129, 140, 248, 0.24)',
        background: 'rgba(129, 140, 248, 0.06)',
        accent: '#818cf8',
        text: '#c7d2fe',
        buttonBackground: '#818cf8',
        buttonText: '#0f1117',
      },
    };
  }

  return {
    state: 'awaiting-merge',
    title: 'Awaiting Review',
    description: 'Merge this pull request on GitHub, then confirm it here to move the card to Done and unlock dependent work.',
    actionLabel: 'Confirm PR Merged',
    tone: {
      border: 'rgba(52, 211, 153, 0.2)',
      background: 'rgba(52, 211, 153, 0.04)',
      accent: '#34d399',
      text: '#8b8d97',
      buttonBackground: '#34d399',
      buttonText: '#0f1117',
    },
  };
}

export function isReviewMergeStatusMessage(error: string | undefined): boolean {
  if (!error) return false;
  return OPEN_MESSAGE.test(error)
    || CLOSED_MESSAGE.test(error)
    || UNKNOWN_MESSAGE.test(error)
    || AUTO_MERGE_PENDING_MESSAGE.test(error);
}
