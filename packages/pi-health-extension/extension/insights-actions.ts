/**
 * Insights, course correction, and gamification action handlers.
 * Covers: analyze_trends, check_compliance, complete_goal, earn_achievement, lookback.
 */

import type { HealthState, Achievement } from '../shared/types';
import { todayISO, generateId } from '../shared/types';
import { readState, writeState } from './state-io';
import { getDailyNutritionTotals } from './nutrition-actions';

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  details: Record<string, unknown>;
}

interface AnalyzeTrendsParams {
  period_days?: number;
  metric?: string;
}

/** Analyze trends across nutrition, workouts, and body metrics. */
export async function handleAnalyzeTrends(
  statePath: string,
  params: AnalyzeTrendsParams,
): Promise<ToolResult> {
  const state = await readState(statePath);
  const days = params.period_days || 30;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const lines = [`=== Trend Analysis (last ${days} days) ===`, ''];

  // Nutrition trends
  const recentMeals = state.nutritionLog.filter((e) => e.date >= cutoffStr);
  if (recentMeals.length > 0) {
    const dailyMap = new Map<string, { cal: number; p: number; c: number; f: number }>();
    for (const entry of recentMeals) {
      const existing = dailyMap.get(entry.date) ?? { cal: 0, p: 0, c: 0, f: 0 };
      existing.cal += entry.calories;
      existing.p += entry.protein;
      existing.c += entry.carbs;
      existing.f += entry.fat;
      dailyMap.set(entry.date, existing);
    }
    const daysLogged = dailyMap.size;
    const avgCal = Math.round([...dailyMap.values()].reduce((s, d) => s + d.cal, 0) / daysLogged);
    const avgP = Math.round([...dailyMap.values()].reduce((s, d) => s + d.p, 0) / daysLogged);
    const avgC = Math.round([...dailyMap.values()].reduce((s, d) => s + d.c, 0) / daysLogged);
    const avgF = Math.round([...dailyMap.values()].reduce((s, d) => s + d.f, 0) / daysLogged);

    lines.push(
      '--- Nutrition ---',
      `Days logged: ${daysLogged}/${days}`,
      `Avg daily: ${avgCal} cal | P:${avgP}g C:${avgC}g F:${avgF}g`,
      `Target: ${state.userContext.dailyCalorieTarget} cal | P:${state.userContext.dailyMacros.protein}g C:${state.userContext.dailyMacros.carbs}g F:${state.userContext.dailyMacros.fat}g`,
      `Calorie adherence: ${Math.round((avgCal / state.userContext.dailyCalorieTarget) * 100)}%`,
      '',
    );
  }

  // Workout trends
  const recentWorkouts = state.workoutLog.filter((w) => w.date >= cutoffStr);
  if (recentWorkouts.length > 0) {
    const totalMinutes = recentWorkouts.reduce((s, w) => s + w.duration, 0);
    const types = new Map<string, number>();
    for (const w of recentWorkouts) {
      types.set(w.type, (types.get(w.type) || 0) + 1);
    }
    lines.push(
      '--- Workouts ---',
      `Total sessions: ${recentWorkouts.length}`,
      `Total minutes: ${totalMinutes}`,
      `Avg per session: ${Math.round(totalMinutes / recentWorkouts.length)} min`,
      `Types: ${[...types.entries()].map(([t, c]) => `${t}(${c})`).join(', ')}`,
      '',
    );
  }

  // Weight trends
  const recentMetrics = state.bodyMetrics
    .filter((m) => m.date >= cutoffStr && m.weight !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (recentMetrics.length >= 2) {
    const first = recentMetrics[0].weight!;
    const last = recentMetrics[recentMetrics.length - 1].weight!;
    const change = last - first;
    lines.push(
      '--- Body Weight ---',
      `Start: ${first} kg → Current: ${last} kg`,
      `Change: ${change >= 0 ? '+' : ''}${change.toFixed(1)} kg`,
      `Measurements: ${recentMetrics.length}`,
      '',
    );
  }

  if (lines.length <= 2) {
    return { content: [{ type: 'text', text: `Not enough data for ${days}-day trend analysis. Keep logging!` }], details: {} };
  }

  return { content: [{ type: 'text', text: lines.join('\n') }], details: {} };
}

/** Check daily compliance and generate course correction advice. */
export async function handleCheckCompliance(statePath: string): Promise<ToolResult> {
  const state = await readState(statePath);
  const ctx = state.userContext;
  const today = todayISO();
  const nutrition = getDailyNutritionTotals(state, today);
  const todayWorkouts = state.workoutLog.filter((w) => w.date === today);

  const calDiff = nutrition.calories - ctx.dailyCalorieTarget;
  const pDiff = nutrition.protein - ctx.dailyMacros.protein;
  const issues: string[] = [];
  const suggestions: string[] = [];

  // Check calorie compliance
  if (calDiff > ctx.dailyCalorieTarget * 0.2) {
    issues.push(`Over calorie target by ${calDiff} cal (${Math.round((calDiff / ctx.dailyCalorieTarget) * 100)}% over)`);
    suggestions.push('Consider a lighter dinner or skip the snack');
    suggestions.push('Add 20 minutes of cardio to offset excess');
  } else if (calDiff > ctx.dailyCalorieTarget * 0.1) {
    issues.push(`Slightly over calorie target by ${calDiff} cal`);
    suggestions.push('Keep remaining meals light and protein-focused');
  }

  // Check protein compliance
  if (pDiff < -ctx.dailyMacros.protein * 0.3 && nutrition.meals >= 2) {
    issues.push(`Protein is low: ${nutrition.protein}g / ${ctx.dailyMacros.protein}g`);
    suggestions.push('Add a high-protein snack (Greek yogurt, protein shake, eggs)');
  }

  // Check workout compliance
  if (todayWorkouts.length === 0 && ctx.dailyCalorieTarget < 2500) {
    // Only flag if in a deficit (active phase)
    suggestions.push('No workout logged today — even a 20-minute walk helps');
  }

  if (issues.length === 0 && suggestions.length <= 1) {
    return { content: [{ type: 'text', text: 'Great job today! You\'re on track with your targets.' }], details: {} };
  }

  const lines = ['--- Daily Compliance Check ---', ''];
  if (issues.length > 0) {
    lines.push('Issues:', ...issues.map((i) => `⚠️ ${i}`), '');
  }
  if (suggestions.length > 0) {
    lines.push('Suggestions:', ...suggestions.map((s) => `💡 ${s}`));
  }

  return { content: [{ type: 'text', text: lines.join('\n') }], details: {} };
}

interface CompleteGoalParams {
  goal_id?: string;
  milestone_id?: string;
}

/** Mark a goal or milestone as completed and trigger achievements. */
export async function handleCompleteGoal(
  statePath: string,
  params: CompleteGoalParams,
): Promise<ToolResult> {
  const state = await readState(statePath);
  const now = new Date().toISOString();

  if (params.milestone_id) {
    const ms = state.mediumTermGoals.find((m) => m.id === params.milestone_id);
    if (!ms) return { content: [{ type: 'text', text: `Milestone ${params.milestone_id} not found` }], details: {} };
    ms.status = 'completed';
    ms.completedAt = now;

    // Award achievement
    const achievement: Achievement = {
      id: generateId(state.nextId),
      type: 'milestone_hit',
      title: `Milestone: ${ms.title}`,
      description: `Completed milestone "${ms.title}" on ${todayISO()}`,
      earnedAt: now,
    };
    state.achievements.push(achievement);
    state.nextId++;
    await writeState(statePath, state);

    return {
      content: [{
        type: 'text',
        text: `🎉 Milestone completed: "${ms.title}"!\nAchievement earned: ${achievement.title}`,
      }],
      details: {},
    };
  }

  if (params.goal_id) {
    const goal = state.longTermGoals.find((g) => g.id === params.goal_id);
    if (!goal) return { content: [{ type: 'text', text: `Goal ${params.goal_id} not found` }], details: {} };
    goal.status = 'completed';
    goal.completedAt = now;

    const achievement: Achievement = {
      id: generateId(state.nextId),
      type: 'goal_completed',
      title: `Goal Achieved: ${goal.title}`,
      description: `Completed long-term goal "${goal.title}" on ${todayISO()}!`,
      earnedAt: now,
    };
    state.achievements.push(achievement);
    state.nextId++;
    await writeState(statePath, state);

    return {
      content: [{
        type: 'text',
        text: `🏆 GOAL COMPLETED: "${goal.title}"!\nAchievement earned: ${achievement.title}\n\nUse "lookback" action to generate a narrative summary of your journey!`,
      }],
      details: {},
    };
  }

  return { content: [{ type: 'text', text: 'Error: goal_id or milestone_id required' }], details: {} };
}

interface LookbackParams {
  goal_id?: string;
}

/** Generate a narrative "Look Back" summary for a completed goal. */
export async function handleLookback(
  statePath: string,
  params: LookbackParams,
): Promise<ToolResult> {
  const state = await readState(statePath);
  const goal = params.goal_id
    ? state.longTermGoals.find((g) => g.id === params.goal_id)
    : state.longTermGoals.find((g) => g.status === 'completed');

  if (!goal) {
    return { content: [{ type: 'text', text: 'No completed goal found for lookback.' }], details: {} };
  }

  const startDate = goal.createdAt.split('T')[0];
  const endDate = goal.completedAt?.split('T')[0] || todayISO();

  // Gather stats for the goal period
  const meals = state.nutritionLog.filter((e) => e.date >= startDate && e.date <= endDate);
  const workouts = state.workoutLog.filter((w) => w.date >= startDate && w.date <= endDate);
  const metrics = state.bodyMetrics.filter((m) => m.date >= startDate && m.date <= endDate);
  const milestones = state.mediumTermGoals.filter((m) => m.parentGoalId === goal.id);

  const lines = [
    `Generate a personalized narrative "Look Back" summary for the goal "${goal.title}":`,
    '',
    `Period: ${startDate} to ${endDate}`,
    `Start: ${goal.startValue} ${goal.unit} → Target: ${goal.targetValue} ${goal.unit}`,
    '',
    `Stats during this period:`,
    `- Meals logged: ${meals.length}`,
    `- Workouts completed: ${workouts.length}`,
    `- Body measurements: ${metrics.length}`,
    `- Milestones: ${milestones.filter((m) => m.status === 'completed').length}/${milestones.length} completed`,
    '',
    'Write a warm, celebratory narrative (3-5 paragraphs) that:',
    '1. Acknowledges the starting point and the courage to begin',
    '2. Highlights key milestones and breakthrough moments',
    '3. Mentions challenges overcome (missed days, plateaus)',
    '4. Celebrates the final achievement',
    '5. Suggests what to focus on next',
    '',
    'Make it personal and motivating. Use second person ("you").',
  ];

  return { content: [{ type: 'text', text: lines.join('\n') }], details: {} };
}

/** Update streak count based on consecutive logging days. */
export async function handleUpdateStreak(statePath: string): Promise<ToolResult> {
  const state = await readState(statePath);
  const today = todayISO();

  // Check if we have entries for today
  const todayNutrition = state.nutritionLog.filter((e) => e.date === today);
  const todayWorkouts = state.workoutLog.filter((w) => w.date === today);

  if (todayNutrition.length === 0 && todayWorkouts.length === 0) {
    return { content: [{ type: 'text', text: `Streak: ${state.userContext.streak} days. Log something today to keep it going!` }], details: {} };
  }

  // Calculate streak by looking backwards from today
  let streak = 0;
  const allDates = new Set([
    ...state.nutritionLog.map((e) => e.date),
    ...state.workoutLog.map((w) => w.date),
  ]);

  const checkDate = new Date(today + 'T00:00:00');
  while (allDates.has(checkDate.toISOString().split('T')[0])) {
    streak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  const oldStreak = state.userContext.streak;
  state.userContext.streak = streak;

  // Check for streak achievements
  const streakMilestones = [7, 14, 30, 60, 100, 365];
  for (const milestone of streakMilestones) {
    if (streak >= milestone && oldStreak < milestone) {
      const existing = state.achievements.find(
        (a) => a.type === 'streak' && a.title.includes(`${milestone}`),
      );
      if (!existing) {
        state.achievements.push({
          id: generateId(state.nextId),
          type: 'streak',
          title: `${milestone}-Day Streak!`,
          description: `Logged health data for ${milestone} consecutive days`,
          earnedAt: new Date().toISOString(),
        });
        state.nextId++;
      }
    }
  }

  // Update personality level based on streak
  if (streak >= 30) state.userContext.personalityLevel = 'advanced';
  else if (streak >= 7) state.userContext.personalityLevel = 'intermediate';
  else state.userContext.personalityLevel = 'beginner';

  await writeState(statePath, state);

  const newAchievements = streak > oldStreak && streakMilestones.includes(streak);
  const text = newAchievements
    ? `🔥 ${streak}-day streak! New achievement unlocked!`
    : `Streak: ${streak} days`;

  return { content: [{ type: 'text', text }], details: {} };
}
