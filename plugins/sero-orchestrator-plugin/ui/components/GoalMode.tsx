import { useCallback, useState } from 'react';
import { useAppTools } from '@sero-ai/app-runtime';
import type { GoalIndexEntry } from '../../shared/goal-types';
import { useGoal } from '../lib/use-goal-index';
import { GoalDetail, type GoalManageAction } from './GoalDetail';
import { GoalsOverview } from './GoalsOverview';

function GoalError({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  if (!message) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive">
      <span>{message}</span>
      <button type="button" className="shrink-0 underline" onClick={onDismiss}>dismiss</button>
    </div>
  );
}

export function GoalMode({
  goalId,
  goals,
  onOpenGoal,
  onBack,
}: {
  goalId: string | null;
  goals: GoalIndexEntry[];
  onOpenGoal: (goalId: string) => void;
  onBack: () => void;
}) {
  const goal = useGoal(goalId);
  const { run } = useAppTools();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dispatch = useCallback(async (params: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const result = await run('goals', params);
      const details = result?.details as { ok?: boolean; error?: string } | null;
      if (details?.ok === false) setError(details.error ?? 'Goal action failed.');
      return details;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    } finally {
      setBusy(false);
    }
  }, [run]);

  const deleteGoal = useCallback(async (targetGoalId: string) => {
    const deleted = await dispatch({ action: 'delete', goalId: targetGoalId });
    return deleted?.ok === true;
  }, [dispatch]);

  const onAction = useCallback(async (action: GoalManageAction) => {
    if (!goal) return;
    if (action === 'delete') {
      if (await deleteGoal(goal.id)) onBack();
      return;
    }
    if (action === 'raise-limit') {
      const maxTurns = (goal.limits.maxAttemptsTotal ?? goal.usage.automaticTurns) + 25;
      const updated = await dispatch({ action: 'set_limits', goalId: goal.id, maxTurns });
      if (updated?.ok !== false) await dispatch({ action: 'resume', goalId: goal.id });
      return;
    }
    await dispatch({ action, goalId: goal.id });
  }, [deleteGoal, dispatch, goal, onBack]);

  if (!goalId) {
    return (
      <div className="flex h-full flex-1 flex-col overflow-hidden">
        <GoalError message={error} onDismiss={() => setError(null)} />
        <div className="flex flex-1 flex-col overflow-auto px-6 py-5">
          <GoalsOverview
            goals={goals}
            busy={busy}
            onOpenGoal={onOpenGoal}
            onDeleteGoal={(targetGoalId) => void deleteGoal(targetGoalId)}
          />
        </div>
      </div>
    );
  }

  if (!goal) return <div className="flex flex-1 items-center justify-center text-sm text-room-text3">Loading Goal…</div>;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <GoalError message={error} onDismiss={() => setError(null)} />
      <GoalDetail goal={goal} busy={busy} onAction={(action) => void onAction(action)} onBack={onBack} />
    </div>
  );
}
