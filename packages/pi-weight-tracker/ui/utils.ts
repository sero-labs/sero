/**
 * Utility functions for the Weight Tracker UI.
 */

import type { WeightEntry, WeightUnit, WeightGoal } from '../shared/types';

// ── Unit conversion ──────────────────────────────────────────

export function formatWeight(weight: number, unit: WeightUnit): string {
  if (unit === 'st') {
    const totalLbs = weight * 2.20462;
    const stones = Math.floor(totalLbs / 14);
    const lbs = Math.round(totalLbs % 14);
    return `${stones}st ${lbs}lb`;
  }
  if (unit === 'lbs') return `${Math.round(weight * 2.20462 * 10) / 10}`;
  return `${Math.round(weight * 10) / 10}`;
}

export function unitLabel(unit: WeightUnit): string {
  if (unit === 'st') return 'st';
  if (unit === 'lbs') return 'lbs';
  return 'kg';
}

// ── Date helpers ─────────────────────────────────────────────

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function formatDateLong(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function daysAgo(iso: string): string {
  const now = new Date();
  const then = new Date(iso + 'T00:00:00');
  const days = Math.floor((now.getTime() - then.getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days}d ago`;
}

// ── Stats ────────────────────────────────────────────────────

export function sortedEntries(entries: WeightEntry[]): WeightEntry[] {
  return [...entries].sort((a, b) => a.date.localeCompare(b.date));
}

export function getWeeklyChange(entries: WeightEntry[]): number | null {
  if (entries.length < 2) return null;
  const sorted = sortedEntries(entries);
  const latest = sorted[sorted.length - 1];
  const weekAgo = new Date(new Date(latest.date).getTime() - 7 * 86400000)
    .toISOString().split('T')[0];
  const weekEntry = sorted.find((e) => e.date >= weekAgo);
  if (!weekEntry || weekEntry.id === latest.id) return null;
  return latest.weight - weekEntry.weight;
}

export function getTotalChange(entries: WeightEntry[]): number | null {
  if (entries.length < 2) return null;
  const sorted = sortedEntries(entries);
  return sorted[sorted.length - 1].weight - sorted[0].weight;
}

export function getGoalProgress(
  entries: WeightEntry[],
  goal: WeightGoal,
): { progress: number; remaining: number } | null {
  if (entries.length === 0) return null;
  const sorted = sortedEntries(entries);
  const latest = sorted[sorted.length - 1];
  const totalToLose = goal.startWeight - goal.target;
  if (totalToLose <= 0) return null;
  const lost = goal.startWeight - latest.weight;
  return {
    progress: Math.min(Math.max(lost / totalToLose, 0), 1),
    remaining: Math.max(latest.weight - goal.target, 0),
  };
}

// ── Encouragement messages ───────────────────────────────────

const MOTIVATIONAL_MESSAGES = [
  { condition: 'first', messages: [
    'Every journey starts with a single step — you\'re on your way! ✨',
    'Brilliant start. Tracking is the first step to transformation. 🌟',
  ]},
  { condition: 'down_big', messages: [
    'Incredible progress — your dedication is really showing! 🔥',
    'You\'re absolutely crushing it. Keep that momentum going! 💫',
    'What a result! Your hard work is paying off beautifully. 🌈',
  ]},
  { condition: 'down_small', messages: [
    'Moving in the right direction — every little bit counts! 💪',
    'Slow and steady wins the race. You\'re doing great. 🐢✨',
    'Progress is progress, no matter the pace. Well done! 🎯',
  ]},
  { condition: 'steady', messages: [
    'Consistency is a superpower — you\'re holding strong! 🎯',
    'Maintaining is an achievement in itself. Respect! 💎',
  ]},
  { condition: 'up_small', messages: [
    'Bodies fluctuate naturally — keep your eyes on the trend! 🌊',
    'One weigh-in doesn\'t define you. Tomorrow\'s a fresh start! 🌅',
  ]},
  { condition: 'up_big', messages: [
    'Be kind to yourself — setbacks are part of every journey. 🌱',
    'Remember how far you\'ve come. This is just a bump in the road. 🏔️',
  ]},
  { condition: 'goal_reached', messages: [
    'You did it! Goal reached — what an incredible achievement! 🎉🏆',
    'GOAL SMASHED! You should be incredibly proud of yourself! 🥇',
  ]},
];

export function getEncouragement(entries: WeightEntry[], goal: WeightGoal | null): string {
  if (entries.length < 2) {
    const msgs = MOTIVATIONAL_MESSAGES.find((m) => m.condition === 'first')!.messages;
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  const sorted = sortedEntries(entries);
  const latest = sorted[sorted.length - 1];

  if (goal && latest.weight <= goal.target) {
    const msgs = MOTIVATIONAL_MESSAGES.find((m) => m.condition === 'goal_reached')!.messages;
    return msgs[Math.floor(Math.random() * msgs.length)];
  }

  const previous = sorted[sorted.length - 2];
  const diff = latest.weight - previous.weight;

  let condition: string;
  if (diff < -0.5) condition = 'down_big';
  else if (diff < 0) condition = 'down_small';
  else if (diff === 0) condition = 'steady';
  else if (diff < 0.5) condition = 'up_small';
  else condition = 'up_big';

  const msgs = MOTIVATIONAL_MESSAGES.find((m) => m.condition === condition)!.messages;
  return msgs[Math.floor(Math.random() * msgs.length)];
}
