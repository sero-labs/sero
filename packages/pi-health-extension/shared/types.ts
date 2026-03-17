/**
 * Shared types for the Health & Fitness extension.
 * Single source of truth — used by both the Pi extension and the web UI.
 */

// ── Goals (Cascading) ────────────────────────────────────────

export type GoalStatus = 'active' | 'completed' | 'paused';

export interface LongTermGoal {
  id: string;
  title: string;
  description: string;
  metric: string;
  targetValue: number;
  startValue: number;
  unit: string;
  status: GoalStatus;
  createdAt: string;
  completedAt?: string;
}

export interface MediumTermGoal {
  id: string;
  parentGoalId: string;
  title: string;
  description: string;
  targetValue: number;
  deadline: string;
  status: GoalStatus;
  createdAt: string;
  completedAt?: string;
}

export interface DailyTargets {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  water?: number;
  steps?: number;
  workoutMinutes?: number;
  sleepHours?: number;
}

export interface DailyGoal {
  id: string;
  parentMilestoneId: string;
  date: string;
  targets: DailyTargets;
  status: 'pending' | 'in_progress' | 'completed';
}

// ── Nutrition ────────────────────────────────────────────────

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';
export type LogSource = 'nlp' | 'vision' | 'manual' | 'recipe';

export interface FoodItem {
  name: string;
  portion: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface NutritionEntry {
  id: string;
  date: string;
  meal: MealType;
  description: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  items: FoodItem[];
  source: LogSource;
  confirmed: boolean;
  createdAt: string;
}

// ── Fitness ──────────────────────────────────────────────────

export type WorkoutType = 'strength' | 'cardio' | 'flexibility' | 'sport' | 'other';

export interface ExerciseSet {
  reps: number;
  weight: number;
  rpe?: number;
}

export interface Exercise {
  name: string;
  sets?: ExerciseSet[];
  duration?: number;
  distance?: number;
  caloriesBurned?: number;
}

export interface WorkoutEntry {
  id: string;
  date: string;
  type: WorkoutType;
  name: string;
  duration: number;
  exercises: Exercise[];
  notes?: string;
  source: LogSource;
  createdAt: string;
}

// ── Body Metrics ─────────────────────────────────────────────

export interface BodyMetric {
  id: string;
  date: string;
  weight?: number;
  bodyFat?: number;
  measurements?: Record<string, number>;
  createdAt: string;
}

// ── Inventory ────────────────────────────────────────────────

export type FoodCategory =
  | 'protein' | 'carb' | 'fat' | 'vegetable'
  | 'fruit' | 'dairy' | 'condiment' | 'other';

export interface InventoryItem {
  id: string;
  name: string;
  category: FoodCategory;
  quantity?: string;
  expiresAt?: string;
  updatedAt: string;
}

// ── User Context ─────────────────────────────────────────────

export type PersonalityLevel = 'beginner' | 'intermediate' | 'advanced';

export interface UserContext {
  currentPhase: string;
  dailyCalorieTarget: number;
  dailyMacros: { protein: number; carbs: number; fat: number };
  equipment: string[];
  injuries: string[];
  preferences: {
    dietType?: string;
    allergies: string[];
    dislikedFoods: string[];
  };
  sleepStatus?: string;
  streak: number;
  personalityLevel: PersonalityLevel;
}

// ── Achievements ─────────────────────────────────────────────

export interface Achievement {
  id: string;
  type: 'milestone_hit' | 'streak' | 'goal_completed';
  title: string;
  description: string;
  imageId?: string;
  earnedAt: string;
}

// ── Top-level State ──────────────────────────────────────────

export interface HealthState {
  userContext: UserContext;
  longTermGoals: LongTermGoal[];
  mediumTermGoals: MediumTermGoal[];
  dailyGoals: DailyGoal[];
  nutritionLog: NutritionEntry[];
  workoutLog: WorkoutEntry[];
  bodyMetrics: BodyMetric[];
  inventory: InventoryItem[];
  achievements: Achievement[];
  nextId: number;
}

export const DEFAULT_USER_CONTEXT: UserContext = {
  currentPhase: 'maintenance',
  dailyCalorieTarget: 2000,
  dailyMacros: { protein: 150, carbs: 200, fat: 65 },
  equipment: [],
  injuries: [],
  preferences: {
    allergies: [],
    dislikedFoods: [],
  },
  sleepStatus: undefined,
  streak: 0,
  personalityLevel: 'beginner',
};

export const DEFAULT_STATE: HealthState = {
  userContext: { ...DEFAULT_USER_CONTEXT },
  longTermGoals: [],
  mediumTermGoals: [],
  dailyGoals: [],
  nutritionLog: [],
  workoutLog: [],
  bodyMetrics: [],
  inventory: [],
  achievements: [],
  nextId: 1,
};

// ── Helpers ──────────────────────────────────────────────────

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function generateId(nextId: number): string {
  return `h${nextId}`;
}
