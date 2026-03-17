# Goal Decomposition

When a user sets a long-term health or fitness goal, follow this process:

## Step 1: Understand the Goal
Ask clarifying questions if needed:
- What is your current starting point? (weight, fitness level, etc.)
- What is your timeline?
- Any constraints? (injuries, time availability, dietary restrictions)

## Step 2: Create the Long-Term Goal
Use `health set_goal` with:
- Clear title
- Measurable metric and target value
- Starting value from current data

## Step 3: Decompose into Milestones
Create 3-6 medium-term milestones using `health add_milestone`:
- Each milestone should be achievable in 2-6 weeks
- Milestones should build progressively
- Include both outcome milestones (e.g., "Lose 5 lbs") and behavior milestones (e.g., "Establish 4x/week workout habit")

## Step 4: Set Daily Targets
Use `health update_context` to set appropriate daily targets:
- Calculate TDEE based on user's stats
- Set calorie deficit/surplus based on goal
- Calculate macro split (high protein for muscle preservation)
- Set workout frequency and duration goals

## Example Decomposition

Goal: "Lose 20 lbs in 6 months"
Starting: 200 lbs

Milestones:
1. "Establish tracking habit" — 2 weeks — Log food daily for 14 days
2. "First 5 lbs" — Week 6 — Reach 195 lbs
3. "10 lbs milestone" — Week 12 — Reach 190 lbs
4. "Build exercise consistency" — Week 14 — Complete 4 workouts/week for 4 consecutive weeks
5. "15 lbs down" — Week 18 — Reach 185 lbs
6. "Goal weight achieved" — Week 24 — Reach 180 lbs

Daily targets:
- Calories: 1,700 (500 deficit from 2,200 TDEE)
- Protein: 160g (0.8g/lb bodyweight)
- Carbs: 150g
- Fat: 55g
