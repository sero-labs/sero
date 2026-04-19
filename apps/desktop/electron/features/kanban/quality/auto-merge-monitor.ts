import { appStateManager } from '@electron/features/apps/state/manager';
import { getPullRequestMergeError, getPullRequestMergeState } from '@electron/features/vcs/worktree/merge-status';
import { updateCard } from '../core/state-helpers';
import type { Card, KanbanState } from '../core/types';

const AUTO_MERGE_INITIAL_POLL_MS = 5_000;
const AUTO_MERGE_POLL_MS = 15_000;
const AUTO_MERGE_PENDING_PATTERN = /auto-merge pending/i;

export function buildAutoMergePendingMessage(prNumber: number): string {
  return `Auto-merge pending for PR #${prNumber}. GitHub will merge it once required conditions are met.`;
}

interface AutoMergeWorkspace {
  workspaceId: string;
  stateFilePath: string;
}

export class AutoMergeMonitor {
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();

  syncWorkspace(workspace: AutoMergeWorkspace, state: KanbanState | null): void {
    const prefix = `${workspace.workspaceId}:`;
    if (!state?.settings?.yoloMode || state.settings.yoloAutoMergePrs !== true) {
      this.clearWorkspace(workspace.workspaceId);
      return;
    }

    const pendingIds = new Set(
      state.cards
        .filter((card) => isAutoMergePendingCard(card))
        .map((card) => card.id),
    );

    for (const key of this.timers.keys()) {
      if (key.startsWith(prefix) && !pendingIds.has(key.slice(prefix.length))) {
        this.clearKey(key);
      }
    }

    for (const cardId of pendingIds) {
      this.ensurePollScheduled(workspace, cardId, AUTO_MERGE_INITIAL_POLL_MS);
    }
  }

  clearWorkspace(workspaceId: string): void {
    const prefix = `${workspaceId}:`;
    for (const key of this.timers.keys()) {
      if (key.startsWith(prefix)) this.clearKey(key);
    }
  }

  private ensurePollScheduled(workspace: AutoMergeWorkspace, cardId: string, delayMs: number): void {
    const key = pollKey(workspace.workspaceId, cardId);
    if (this.timers.has(key)) return;

    const timer = setTimeout(() => {
      this.clearKey(key);
      void this.poll(workspace, cardId);
    }, delayMs);
    this.timers.set(key, timer);
  }

  private async poll(workspace: AutoMergeWorkspace, cardId: string): Promise<void> {
    const state = await appStateManager.read(workspace.stateFilePath) as KanbanState | null;
    const card = state?.cards.find((entry) => entry.id === cardId);

    if (!state?.settings?.yoloMode || state.settings.yoloAutoMergePrs !== true || !card || !isAutoMergePendingCard(card)) {
      return;
    }
    if (!card.prNumber || !card.worktreePath) {
      return;
    }

    const mergeState = await getPullRequestMergeState(card.worktreePath, card.prNumber);

    if (mergeState === 'merged') {
      await updateCard(workspace.stateFilePath, card.id, {
        column: 'done',
        status: 'idle',
        completedAt: new Date().toISOString(),
        error: undefined,
      });
      return;
    }

    if (mergeState === 'closed') {
      const mergeError = await getPullRequestMergeError(card.worktreePath, card.prNumber);
      await updateCard(workspace.stateFilePath, card.id, {
        status: 'waiting-input',
        error: mergeError ?? `PR #${card.prNumber} was closed without merging.`,
      });
      return;
    }

    this.ensurePollScheduled(workspace, cardId, AUTO_MERGE_POLL_MS);
  }

  private clearKey(key: string): void {
    const timer = this.timers.get(key);
    if (timer) clearTimeout(timer);
    this.timers.delete(key);
  }
}

function pollKey(workspaceId: string, cardId: string): string {
  return `${workspaceId}:${cardId}`;
}

function isAutoMergePendingCard(card: Card): boolean {
  return card.column === 'review'
    && card.status === 'waiting-input'
    && !!card.prUrl
    && !!card.prNumber
    && !!card.worktreePath
    && AUTO_MERGE_PENDING_PATTERN.test(card.error ?? '');
}
