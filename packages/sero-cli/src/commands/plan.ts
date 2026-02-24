/**
 * sero plan — plan mode and task management.
 *
 * State: workspace-scoped.
 * Compatible with pi-plan-mode-extension state files.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { CommandDef, Flags } from '../main.js';
import { resolveWorkspaceStatePath, readState, writeState } from '../state.js';

interface PlanStep {
  step: number;
  text: string;
  completed: boolean;
}

type PlanMode = 'normal' | 'plan' | 'execute';

interface PlanModeState {
  mode: PlanMode;
  steps: PlanStep[];
}

interface PlanIndexEntry {
  filename: string;
  completedAt: string;
  stepCount: number;
  summary: string;
}

interface PlanIndex {
  plans: PlanIndexEntry[];
}

interface ArchivedPlan {
  completedAt: string;
  steps: PlanStep[];
}

const DEFAULT: PlanModeState = { mode: 'normal', steps: [] };

const PLANMODE_DIR = path.join('.sero', 'apps', 'planmode');

function statePath(): string {
  return resolveWorkspaceStatePath('planmode');
}

function indexPath(): string {
  return path.join(process.cwd(), PLANMODE_DIR, 'index.json');
}

function planDir(): string {
  return path.join(process.cwd(), PLANMODE_DIR);
}

async function run(args: string[], flags: Flags): Promise<void> {
  const action = args[0];
  if (!action) throw new Error('No action specified. Run \'sero help plan\' for usage.');

  const fp = statePath();
  const state = await readState<PlanModeState>(fp, DEFAULT);

  switch (action) {
    case 'list': {
      if (state.steps.length === 0) {
        process.stdout.write('No plan steps yet.\n');
        return;
      }
      const done = state.steps.filter((s) => s.completed).length;

      if (flags.json) {
        process.stdout.write(JSON.stringify({
          mode: state.mode,
          steps: state.steps,
          completed: done,
          total: state.steps.length,
        }, null, 2) + '\n');
        return;
      }

      const list = state.steps
        .map((s) => `${s.step}. ${s.completed ? '[x]' : '[ ]'} ${s.text}`)
        .join('\n');
      process.stdout.write(`Plan (${done}/${state.steps.length} complete):\n${list}\n`);
      return;
    }

    case 'set': {
      // sero plan set "Step 1" "Step 2" "Step 3"
      const stepTexts = args.slice(1);
      if (stepTexts.length === 0) throw new Error('At least one step is required. Usage: sero plan set "Step 1" "Step 2"');

      state.steps = stepTexts.map((text, i) => ({
        step: i + 1,
        text,
        completed: false,
      }));
      await writeState(fp, state);

      if (flags.json) {
        process.stdout.write(JSON.stringify({ steps: state.steps }, null, 2) + '\n');
        return;
      }

      const list = state.steps.map((s) => `${s.step}. [ ] ${s.text}`).join('\n');
      process.stdout.write(`Plan created (${state.steps.length} steps):\n${list}\n`);
      return;
    }

    case 'complete': {
      const stepNum = Number(args[1]);
      if (!stepNum || isNaN(stepNum)) throw new Error('Step number is required. Usage: sero plan complete <step>');
      const item = state.steps.find((s) => s.step === stepNum);
      if (!item) throw new Error(`Step ${stepNum} not found.`);
      item.completed = true;
      await writeState(fp, state);

      const done = state.steps.filter((s) => s.completed).length;

      // Auto-archive if all steps complete
      if (state.steps.every((s) => s.completed)) {
        await archivePlan(state.steps);
        state.mode = 'normal';
        state.steps = [];
        await writeState(fp, state);
        process.stdout.write(`Step ${stepNum} completed: ${item.text} (${done}/${done})\nAll steps complete! Plan archived.\n`);
        return;
      }

      process.stdout.write(`Step ${stepNum} completed: ${item.text} (${done}/${state.steps.length})\n`);
      return;
    }

    case 'archive': {
      // Show archived plans
      const idxPath = indexPath();
      let index: PlanIndex;
      try {
        const raw = await fs.readFile(idxPath, 'utf8');
        index = JSON.parse(raw) as PlanIndex;
      } catch {
        index = { plans: [] };
      }

      if (index.plans.length === 0) {
        process.stdout.write('No archived plans.\n');
        return;
      }

      if (flags.json) {
        process.stdout.write(JSON.stringify(index, null, 2) + '\n');
        return;
      }

      const lines = index.plans.map((p, i) =>
        `${i + 1}. ${p.summary} (${p.stepCount} steps, completed ${p.completedAt})`,
      );
      process.stdout.write(`Archived plans:\n${lines.join('\n')}\n`);
      return;
    }

    default:
      throw new Error(`Unknown action "${action}". Run 'sero help plan' for usage.`);
  }
}

async function archivePlan(steps: PlanStep[]): Promise<void> {
  const dir = planDir();
  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, '-');
  const filename = `plan-${ts}.json`;
  const filePath = path.join(dir, filename);

  const archive: ArchivedPlan = {
    completedAt: now.toISOString(),
    steps: [...steps],
  };

  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp.${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(archive, null, 2), 'utf8');
  await fs.rename(tmp, filePath);

  // Update index
  const idxPath = indexPath();
  let index: PlanIndex;
  try {
    const raw = await fs.readFile(idxPath, 'utf8');
    index = JSON.parse(raw) as PlanIndex;
  } catch {
    index = { plans: [] };
  }

  index.plans.unshift({
    filename,
    completedAt: now.toISOString(),
    stepCount: steps.length,
    summary: steps[0]?.text.slice(0, 120) ?? '',
  });

  const idxTmp = `${idxPath}.tmp.${Date.now()}`;
  await fs.writeFile(idxTmp, JSON.stringify(index, null, 2), 'utf8');
  await fs.rename(idxTmp, idxPath);
}

export const planCommand: CommandDef = {
  description: 'Plan mode and task management',
  helpText: `Manage task plans — create, track, and archive step-by-step plans.

USAGE
  sero plan <action> [args]

ACTIONS
  list                Show current plan steps with completion status
  set <steps...>      Create/replace plan with given steps
  complete <step>     Mark a step as completed (1-indexed)
  archive             Show archived (completed) plans

FLAGS
  --json              Output as JSON

EXAMPLES
  sero plan set "Analyse auth module" "Refactor token handling" "Add tests"
  sero plan list
  sero plan complete 1
  sero plan complete 2
  sero plan archive`,
  run,
};
