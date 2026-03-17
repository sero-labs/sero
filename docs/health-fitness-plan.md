# Sero Health & Fitness Tracker — Implementation Plan

## Package: `packages/pi-health-extension`
- **App ID:** `health`
- **Display Name:** Health
- **Icon:** `heart-pulse`
- **Scope:** `global` (user health data persists across workspaces)
- **State File:** `.sero/apps/health/state.json`
- **Dev Port:** `5194`
- **MF Remote Name:** `sero_health`

---

## Phase 1: Foundation — Package Scaffold + Core Data Models + Basic Tools
**Goal:** Get the app registered, rendering, and handling basic CRUD via the agent tool.

### Task 1.1: Package scaffold
Create the full package structure following the apps tutorial:
```
packages/pi-health-extension/
├── package.json            # sero.app manifest, pi extension, devDependencies
├── vite.config.ts          # MF remote config, port 5194
├── shared/
│   └── types.ts            # All state interfaces (see 1.2)
├── extension/
│   ├── index.ts            # Pi extension entry, tool registration
│   ├── state-io.ts         # Atomic read/write + mutex
│   └── tsconfig.json
├── ui/
│   ├── HealthApp.tsx        # Root federated component
│   ├── styles.css           # Tailwind + theme tokens
│   ├── index.html
│   └── tsconfig.json
└── prompts/                 # Prompt templates (later phases)
```

### Task 1.2: Core data models (`shared/types.ts`)
Design the Cascading Goal Schema + all log types:

```typescript
// ---- Goals (Cascading) ----
interface LongTermGoal {
  id: string;
  title: string;              // "Lose 20 lbs safely"
  description: string;
  metric: string;             // "weight", "body_fat", etc.
  targetValue: number;
  startValue: number;
  unit: string;
  status: 'active' | 'completed' | 'paused';
  createdAt: string;
  completedAt?: string;
}

interface MediumTermGoal {
  id: string;
  parentGoalId: string;       // links to LongTermGoal
  title: string;              // "Lose 5 lbs in 4 weeks"
  description: string;
  targetValue: number;
  deadline: string;           // ISO date
  status: 'active' | 'completed' | 'paused';
  createdAt: string;
  completedAt?: string;
}

interface DailyGoal {
  id: string;
  parentMilestoneId: string;  // links to MediumTermGoal
  date: string;               // YYYY-MM-DD
  targets: DailyTargets;
  status: 'pending' | 'in_progress' | 'completed';
}

interface DailyTargets {
  calories?: number;
  protein?: number;           // grams
  carbs?: number;
  fat?: number;
  water?: number;             // ml
  steps?: number;
  workoutMinutes?: number;
  sleepHours?: number;
}

// ---- Nutrition Logging ----
interface NutritionEntry {
  id: string;
  date: string;
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  description: string;        // natural language or parsed
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  items: FoodItem[];          // individual foods
  source: 'nlp' | 'vision' | 'manual' | 'recipe';
  confirmed: boolean;         // user confirmed AI estimates
  createdAt: string;
}

interface FoodItem {
  name: string;
  portion: string;            // "1 cup", "200g"
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

// ---- Fitness Logging ----
interface WorkoutEntry {
  id: string;
  date: string;
  type: 'strength' | 'cardio' | 'flexibility' | 'sport' | 'other';
  name: string;               // "Upper Body Push", "5K Run"
  duration: number;           // minutes
  exercises: Exercise[];
  notes?: string;
  source: 'nlp' | 'generated' | 'manual';
  createdAt: string;
}

interface Exercise {
  name: string;
  sets?: ExerciseSet[];
  duration?: number;          // minutes (for cardio)
  distance?: number;          // km
  caloriesBurned?: number;
}

interface ExerciseSet {
  reps: number;
  weight: number;             // kg
  rpe?: number;               // rate of perceived exertion 1-10
}

// ---- Body Metrics ----
interface BodyMetric {
  id: string;
  date: string;
  weight?: number;            // kg
  bodyFat?: number;           // percentage
  measurements?: Record<string, number>; // waist, chest, etc. in cm
  createdAt: string;
}

// ---- Inventory ----
interface InventoryItem {
  id: string;
  name: string;
  category: 'protein' | 'carb' | 'fat' | 'vegetable' | 'fruit' | 'dairy' | 'condiment' | 'other';
  quantity?: string;          // "500g", "2 cans"
  expiresAt?: string;
  updatedAt: string;
}

// ---- User Context State ----
interface UserContext {
  currentPhase: string;       // "cutting", "bulking", "maintenance"
  dailyCalorieTarget: number;
  dailyMacros: { protein: number; carbs: number; fat: number };
  equipment: string[];        // "dumbbells", "barbell", "pull-up bar"
  injuries: string[];         // "left knee strain"
  preferences: {
    dietType?: string;        // "omnivore", "vegetarian", "vegan", "keto"
    allergies: string[];
    dislikedFoods: string[];
  };
  sleepStatus?: string;       // "well-rested", "tired", "sleep-deprived"
  streak: number;             // consecutive days of logging
  personalityLevel: 'beginner' | 'intermediate' | 'advanced';
}

// ---- Rewards & Achievements ----
interface Achievement {
  id: string;
  type: 'milestone_hit' | 'streak' | 'goal_completed';
  title: string;
  description: string;
  imageId?: string;           // reference to generated image
  earnedAt: string;
}

// ---- Top-level State ----
interface HealthState {
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
```

### Task 1.3: Pi extension — `health` tool
Register a single `health` tool with these initial actions:

| Action | Description |
|--------|-------------|
| `status` | Show daily summary (macros eaten, remaining, workout status, goal progress) |
| `log_food` | NLP: parse natural language food description → nutrition entry |
| `log_workout` | NLP: parse natural language workout → workout entry |
| `log_weight` | Record body weight/metrics |
| `set_goal` | Create a long-term goal, trigger AI decomposition into milestones |
| `list_goals` | Show cascading goal tree |
| `update_context` | Set user preferences (equipment, diet, injuries, etc.) |
| `inventory` | CRUD for pantry/fridge items |

### Task 1.4: State I/O (`extension/state-io.ts`)
Atomic read/write with mutex, following the cron extension pattern.

### Task 1.5: Basic UI shell (`ui/HealthApp.tsx`)
Tabbed layout with:
- **Dashboard** tab (daily summary, macros remaining, goal progress bars)
- **Log** tab (recent food + workout entries)
- **Goals** tab (cascading goal tree)
- **Profile** tab (user context, preferences)

### Task 1.6: Add tool to TOOLS_TO_BRIDGE
Register `health` in `apps/desktop/electron/cli/index.ts`.

---

## Phase 2: AI Goal Decomposer + Contextual State
**Goal:** When a user sets a long-term goal, the agent auto-generates milestones and daily targets.

### Task 2.1: Goal decomposition pipeline
In the `set_goal` action handler:
1. Accept natural language goal (e.g., "Lose 20 lbs in 6 months")
2. Create the LongTermGoal record
3. Return a structured response prompting the agent to generate MediumTermGoals
4. The agent (via system prompt context) breaks the goal into 4-8 milestones with deadlines
5. Each milestone gets daily targets (calories, macros, workout minutes)

### Task 2.2: Contextual State Object injection
Create a prompt template (`prompts/system-context.md`) that:
- Reads the user's current context (phase, targets, equipment, injuries)
- Includes today's progress (calories eaten, macros, workout done?)
- Includes active goals and current milestone
- This gets injected into every agent interaction

### Task 2.3: Dashboard UI components
Build out the Dashboard tab:
- `DailySummary.tsx` — circular progress rings for calories, protein, carbs, fat
- `GoalProgress.tsx` — milestone timeline visualization
- `QuickLog.tsx` — one-tap buttons to log common meals/workouts via agent

---

## Phase 3: NLP Logging + Vision Intake
**Goal:** Parse natural language and food photos into structured nutrition data.

### Task 3.1: Enhanced NLP food parsing
Improve `log_food` to handle complex inputs:
- "Had a chicken breast with rice and broccoli for lunch, about 6oz chicken"
- Extract individual FoodItems with estimated macros
- Return structured data for user confirmation

### Task 3.2: Vision intake tool action
Add `analyze_photo` action to the health tool:
- Accept image path/description
- Use the agent's vision capabilities to analyze meal photos
- Estimate portions and macros
- Generate a confirmation UI widget in chat (JSON-render style)

### Task 3.3: Confirmation/edit flow
When AI estimates food data:
1. Present estimates in a structured format in chat
2. User can confirm ("looks good") or correct ("actually it was 8oz chicken")
3. Confirmed entry gets committed to nutritionLog

### Task 3.4: Inventory memory
Add `inventory` actions: `add_item`, `remove_item`, `list_items`, `update_item`
- Auto-deduct from inventory when meals are logged (if items match)
- Agent can suggest items running low

---

## Phase 4: Agentic Nutrition & Meal Planning
**Goal:** Proactive dietary management.

### Task 4.1: Recipe generator tool action
Add `generate_recipe` action:
- Consider: remaining daily macros, inventory items, dietary preferences
- Generate complete recipe with ingredients, instructions, and macro breakdown
- Store generated recipes for reuse

### Task 4.2: Restaurant menu parser
Add `parse_menu` action:
- Accept restaurant name or URL
- Use web search to find menu items
- Filter and recommend items fitting remaining daily macros
- Present ranked options with macro breakdowns

### Task 4.3: Grocery list generator
Add `generate_grocery_list` action:
- Based on a meal plan (generated or user-provided)
- Cross-reference with inventory to avoid duplicates
- Output organized shopping list by store section

### Task 4.4: Meal planning UI
Add **Meals** tab to UI:
- Weekly meal plan view
- Recipe cards with macro summaries
- Shopping list view
- "Plan my week" button that triggers agent

---

## Phase 5: Dynamic Fitness Generation
**Goal:** Adaptive workout programming.

### Task 5.1: Workout generator tool action
Add `generate_workout` action:
- Constraints: time available, equipment, soreness/injuries, goals
- Generate structured workout with sets, reps, weights
- Progressive overload: reference past workout logs to increase difficulty

### Task 5.2: Progressive overload logic
Add `review_progress` action:
- Analyze past N workouts for an exercise
- Recommend weight/rep increases
- Generate natural language explanation for the change

### Task 5.3: Health data sync (Apple Health)
Add `sync_health_data` action:
- Read from Apple Health (via container or native API if available)
- Pull: sleep duration, HRV, resting HR, steps, active calories
- Update userContext with recovery status
- Agent suggests workout modifications based on recovery

### Task 5.4: Workouts UI
Add **Workouts** tab to UI:
- Today's workout plan (generated or custom)
- Exercise cards with sets/reps tracking
- Workout history with progressive overload visualization
- "Generate workout" button

---

## Phase 6: Proactive Insights & Background Monitoring
**Goal:** Background agent loop for course correction + push notifications.

### Task 6.1: Proactive course correction (cron-like)
Register a Pi prompt or use the cron extension pattern:
- Daily check (or on each log): compare today's intake vs. daily targets
- If deviation detected (>15% over/under calories, missed workout):
  - Auto-adjust next day's plan
  - Send supportive notification via `sero:notify`

### Task 6.2: Dynamic UI widgets in chat
When the agent responds to queries like "how's my weight trend?":
- Generate chart data (weight over time, macro distribution)
- Render inline in chat using structured data
- Support: line charts, bar charts, pie charts for macro splits

### Task 6.3: Speed bump / friction UIs
When a logged action severely impacts goals:
- Agent detects (e.g., 1500 calorie meal when 200 cal remaining)
- Generates a warning message with alternatives
- Asks user to confirm before committing the log

### Task 6.4: Insights UI
Enhance Dashboard with:
- Weekly/monthly trend charts (weight, calories, macros)
- Correlation insights ("your weight drops when you sleep 7+ hours")
- Streaks and consistency metrics

---

## Phase 7: Gamification & Rewards
**Goal:** Personalized celebrations and evolving agent personality.

### Task 7.1: Milestone image generation
When a MediumTermGoal is completed:
- Trigger image generation (via pi-imagegen-extension bridge or direct API)
- Generate personalized artwork celebrating the achievement
- Store as Achievement record with imageId

### Task 7.2: Narrative "Look Back"
When a LongTermGoal is completed:
- Query all logs and metrics for the goal period
- Generate a narrative summary of the journey
- Include key milestones, challenges overcome, stats

### Task 7.3: Evolving system prompts
Based on user's streak and goal completion rate:
- `beginner` (streak < 7): Encouraging, educational, gentle nudges
- `intermediate` (streak 7-30): More detailed feedback, moderate accountability
- `advanced` (streak > 30): Data-driven, direct, advanced techniques

### Task 7.4: Achievements UI
Add **Achievements** tab to UI:
- Achievement cards with generated images
- Streak counter and calendar heatmap
- "Look Back" narrative viewer
- Progress milestones timeline

---

## File Size Compliance Strategy

Every source file must stay under 500 LOC. Planned splits:

**Extension:**
- `extension/index.ts` — Tool registration + routing (~200 LOC)
- `extension/state-io.ts` — Atomic I/O + mutex (~80 LOC)
- `extension/nutrition-actions.ts` — Food logging, inventory (~200 LOC)
- `extension/fitness-actions.ts` — Workout logging, generation (~200 LOC)
- `extension/goal-actions.ts` — Goal CRUD, decomposition (~200 LOC)
- `extension/context-actions.ts` — User context, insights (~150 LOC)

**UI:**
- `ui/HealthApp.tsx` — Root + tab routing (~150 LOC)
- `ui/components/Dashboard.tsx` — Daily summary view (~200 LOC)
- `ui/components/MacroRings.tsx` — Circular progress rings (~150 LOC)
- `ui/components/GoalTree.tsx` — Cascading goal visualization (~200 LOC)
- `ui/components/LogList.tsx` — Food + workout log entries (~200 LOC)
- `ui/components/WorkoutCard.tsx` — Single workout display (~150 LOC)
- `ui/components/NutritionCard.tsx` — Single meal display (~150 LOC)
- `ui/components/ProfileView.tsx` — User context editor (~200 LOC)
- `ui/components/AchievementCard.tsx` — Single achievement (~100 LOC)
- `ui/lib/utils.ts` — Formatting, calculations (~150 LOC)

---

## Delivery Order Summary

| Phase | Deliverable | Key Files |
|-------|------------|-----------|
| **1** | Scaffold + models + basic tool + basic UI | All foundational files |
| **2** | Goal decomposition + context injection + dashboard | goal-actions.ts, Dashboard, prompts/ |
| **3** | NLP food parsing + vision + inventory | nutrition-actions.ts, confirmation flow |
| **4** | Recipes + menu parser + grocery lists | nutrition-actions.ts, Meals tab |
| **5** | Workout generator + progressive overload | fitness-actions.ts, Workouts tab |
| **6** | Background monitoring + inline charts + friction UIs | cron integration, Insights UI |
| **7** | Image rewards + narrative + evolving prompts | Achievements tab, prompts/ |

Each phase is self-contained and testable. Phase 1 is the critical path — all subsequent phases build on it.
