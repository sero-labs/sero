/**
 * Cascading goal tree visualization.
 * Shows long-term goals with their medium-term milestones.
 */

import { useCallback } from 'react';
import type { HealthState, LongTermGoal, MediumTermGoal } from '../../shared/types';
import { useAgentPrompt } from '@sero/app-runtime';

interface GoalTreeProps {
  state: HealthState;
}

function MilestoneCard({ milestone }: { milestone: MediumTermGoal }) {
  const statusIcon = milestone.status === 'completed' ? '✅' : milestone.status === 'paused' ? '⏸️' : '📍';
  const isCompleted = milestone.status === 'completed';

  return (
    <div className={`ml-6 flex items-start gap-2 rounded-lg border border-border/50 bg-card/50 px-3 py-2 ${isCompleted ? 'opacity-60' : ''}`}>
      <span className="mt-0.5 text-sm">{statusIcon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{milestone.title}</div>
        {milestone.deadline && (
          <div className="text-xs text-muted-foreground">Due: {milestone.deadline}</div>
        )}
        {milestone.description && (
          <div className="mt-1 text-xs text-muted-foreground/70 line-clamp-2">{milestone.description}</div>
        )}
      </div>
    </div>
  );
}

function GoalCard({ goal, milestones }: { goal: LongTermGoal; milestones: MediumTermGoal[] }) {
  const statusIcon = goal.status === 'completed' ? '🏆' : goal.status === 'paused' ? '⏸️' : '🎯';
  const isCompleted = goal.status === 'completed';
  const completedMilestones = milestones.filter((m) => m.status === 'completed').length;

  return (
    <div className={`animate-fade-in-up rounded-xl border border-border bg-card p-4 ${isCompleted ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-3">
        <span className="text-xl">{statusIcon}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-foreground">{goal.title}</h3>
          {goal.description && (
            <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{goal.description}</p>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span>{goal.startValue} → {goal.targetValue} {goal.unit}</span>
            {milestones.length > 0 && (
              <span className="rounded-full bg-muted px-2 py-0.5">
                {completedMilestones}/{milestones.length} milestones
              </span>
            )}
          </div>

          {/* Progress bar */}
          {milestones.length > 0 && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${(completedMilestones / milestones.length) * 100}%`,
                  backgroundColor: 'var(--health-success)',
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* Milestones */}
      {milestones.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {milestones.map((ms) => (
            <MilestoneCard key={ms.id} milestone={ms} />
          ))}
        </div>
      )}
    </div>
  );
}

export function GoalTree({ state }: GoalTreeProps) {
  const prompt = useAgentPrompt();

  const handleCreateGoal = useCallback(() => {
    prompt(
      'I want to set a new long-term health or fitness goal. Ask me about my goal and help me create it with realistic milestones.',
    );
  }, [prompt]);

  if (state.longTermGoals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <span className="text-4xl">🎯</span>
        <p className="text-sm text-muted-foreground">No goals set yet</p>
        <button
          onClick={handleCreateGoal}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Set Your First Goal
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Goals</h2>
        <button
          onClick={handleCreateGoal}
          className="rounded-md bg-muted px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted/80 transition-colors"
        >
          + New Goal
        </button>
      </div>
      {state.longTermGoals.map((goal) => {
        const milestones = state.mediumTermGoals.filter((m) => m.parentGoalId === goal.id);
        return <GoalCard key={goal.id} goal={goal} milestones={milestones} />;
      })}
    </div>
  );
}
