import type { ChatGoalSnapshot } from '@/types/ipc';

export type GoalBannerAction = 'pause' | 'resume' | 'stop' | 'raise-limit';

export function goalBannerCommands(goal: ChatGoalSnapshot, action: GoalBannerAction): string[] {
  if (action !== 'raise-limit') return [`/goal ${action}`];
  const maxTurns = (goal.limits.maxAttemptsTotal ?? goal.usage.automaticTurns) + 25;
  return [`/goal turns ${maxTurns}`, '/goal resume'];
}
