/**
 * Plan Mode Extension — Sero adaptation.
 *
 * Read-only exploration mode with a plan_todos tool for structured
 * plan management. The agent uses the tool to create plans and mark
 * steps complete — no fragile text/regex parsing needed.
 *
 * Completed plans are archived as plan-<timestamp>.json files with
 * an index.json manifest in the same folder.
 *
 * Tools: plan_todos (set_plan, complete_step, list)
 * Commands: /plan, /plan-execute, /plan-todos
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { StringEnum } from '@mariozechner/pi-ai';
import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { Text } from '@mariozechner/pi-tui';
import { Type } from '@sinclair/typebox';

import type {
  PlanModeState, PlanStep, PlanMode, PlanIndex, ArchivedPlan,
} from '../shared/types';
import { isSafeCommand } from '../shared/utils';

// ── Constants ──────────────────────────────────────────────────

const PLAN_MODE_TOOLS = [
  'read', 'bash', 'grep', 'find', 'ls', 'questionnaire', 'plan_todos',
];
const NORMAL_MODE_TOOLS = ['read', 'bash', 'edit', 'write', 'plan_todos'];
const PLANMODE_DIR = path.join('.sero', 'apps', 'planmode');
const STATE_REL_PATH = path.join(PLANMODE_DIR, 'state.json');
const INDEX_REL_PATH = path.join(PLANMODE_DIR, 'index.json');

// ── Extension ──────────────────────────────────────────────────

export default function planModeExtension(pi: ExtensionAPI): void {
  let currentMode: PlanMode = 'normal';
  let steps: PlanStep[] = [];
  let statePath = '';
  let indexPath = '';
  let planDir = '';

  // ── Path & state helpers ───────────────────────────────────

  function ensureStatePath(ctx?: { cwd?: string }): void {
    if (!statePath && ctx?.cwd) {
      statePath = path.join(ctx.cwd, STATE_REL_PATH);
      indexPath = path.join(ctx.cwd, INDEX_REL_PATH);
      planDir = path.join(ctx.cwd, PLANMODE_DIR);
      console.log(`[plan-mode] statePath resolved: ${statePath}`);
    }
  }

  async function atomicWrite(filePath: string, data: unknown): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.tmp.${Date.now()}`;
    await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
    await fs.rename(tmp, filePath);
  }

  async function syncStateToFile(): Promise<void> {
    if (!statePath) {
      console.warn('[plan-mode] syncStateToFile skipped — statePath empty');
      return;
    }
    const state: PlanModeState = { mode: currentMode, steps };
    try {
      await atomicWrite(statePath, state);
    } catch (err) {
      console.error('[plan-mode] Failed to sync state:', err);
    }
  }

  /** Archive the current plan and update index.json. */
  async function archivePlan(): Promise<void> {
    if (!planDir || steps.length === 0) return;
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-');
    const filename = `plan-${ts}.json`;
    const filePath = path.join(planDir, filename);

    const archive: ArchivedPlan = {
      completedAt: now.toISOString(),
      steps: [...steps],
    };

    try {
      await atomicWrite(filePath, archive);

      // Read existing index (or start fresh)
      const index = await readIndex();
      const summary = steps[0]?.text.slice(0, 120) ?? '';
      index.plans.unshift({
        filename,
        completedAt: now.toISOString(),
        stepCount: steps.length,
        summary,
      });
      await atomicWrite(indexPath, index);
      console.log(`[plan-mode] Archived plan: ${filename}`);
    } catch (err) {
      console.error('[plan-mode] Failed to archive plan:', err);
    }
  }

  async function readIndex(): Promise<PlanIndex> {
    try {
      const raw = await fs.readFile(indexPath, 'utf8');
      return JSON.parse(raw) as PlanIndex;
    } catch {
      return { plans: [] };
    }
  }

  function makeResult(text: string, error = false) {
    return {
      content: [{ type: 'text' as const, text }],
      details: {},
      ...(error && { isError: true }),
    };
  }

  // ── Mode management ────────────────────────────────────────

  async function togglePlanMode(): Promise<string> {
    if (currentMode === 'normal') {
      currentMode = 'plan';
      steps = [];
      pi.setActiveTools(PLAN_MODE_TOOLS);
      await syncStateToFile();
      return 'Plan mode enabled. Only read-only tools + plan_todos available.';
    }
    currentMode = 'normal';
    steps = [];
    pi.setActiveTools(NORMAL_MODE_TOOLS);
    await syncStateToFile();
    return 'Plan mode disabled. Full tool access restored.';
  }

  async function enterExecutionMode(): Promise<void> {
    currentMode = 'execute';
    pi.setActiveTools(NORMAL_MODE_TOOLS);
    await syncStateToFile();
  }

  function persistEntry(): void {
    pi.appendEntry('plan-mode', { mode: currentMode, steps });
  }

  // ── Tool: plan_todos ───────────────────────────────────────

  pi.registerTool({
    name: 'plan_todos',
    label: 'Plan Todos',
    description:
      'Manage the task plan.\n' +
      'Actions:\n' +
      '  set_plan — Create/replace the plan. Requires `steps` (array of step description strings).\n' +
      '  complete_step — Mark a step done. Requires `step` (step number, 1-indexed).\n' +
      '  list — Show all steps with completion status.',
    parameters: Type.Object({
      action: StringEnum(['set_plan', 'complete_step', 'list'] as const),
      steps: Type.Optional(
        Type.Array(Type.String(), {
          description: 'Step descriptions (for set_plan)',
        }),
      ),
      step: Type.Optional(
        Type.Number({ description: 'Step number to complete (for complete_step)' }),
      ),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      ensureStatePath(ctx);

      switch (params.action) {
        case 'set_plan': {
          if (!params.steps?.length) {
            return makeResult('Error: steps array is required for set_plan', true);
          }
          steps = params.steps.map((text, i) => ({
            step: i + 1,
            text,
            completed: false,
          }));
          await syncStateToFile();
          persistEntry();
          const list = steps.map((s) => `${s.step}. ○ ${s.text}`).join('\n');
          return makeResult(`Plan created (${steps.length} steps):\n${list}`);
        }

        case 'complete_step': {
          if (params.step === undefined) {
            return makeResult('Error: step number required for complete_step', true);
          }
          const item = steps.find((s) => s.step === params.step);
          if (!item) {
            return makeResult(`Error: step ${params.step} not found`, true);
          }
          item.completed = true;
          await syncStateToFile();
          persistEntry();
          const done = steps.filter((s) => s.completed).length;
          return makeResult(
            `✓ Step ${item.step} completed: ${item.text} (${done}/${steps.length})`,
          );
        }

        case 'list': {
          if (steps.length === 0) return makeResult('No plan steps yet.');
          const done = steps.filter((s) => s.completed).length;
          const list = steps
            .map((s) => `${s.step}. ${s.completed ? '✓' : '○'} ${s.text}`)
            .join('\n');
          return makeResult(`Plan (${done}/${steps.length} complete):\n${list}`);
        }

        default:
          return makeResult(`Unknown action: ${params.action}`, true);
      }
    },

    renderCall(args, theme) {
      let text = theme.fg('toolTitle', theme.bold('plan_todos '));
      text += theme.fg('muted', args.action);
      if (args.step !== undefined) text += ` ${theme.fg('accent', `#${args.step}`)}`;
      if (args.steps?.length) text += ` ${theme.fg('dim', `(${args.steps.length} steps)`)}`;
      return new Text(text, 0, 0);
    },

    renderResult(result, _options, theme) {
      const msg = result.content?.[0]?.type === 'text' ? result.content[0].text : '';
      if (msg.startsWith('Error:')) return new Text(theme.fg('error', msg), 0, 0);
      return new Text(theme.fg('success', '✓ ') + theme.fg('muted', msg), 0, 0);
    },
  });

  // ── Flag (Pi CLI: --plan) ──────────────────────────────────

  pi.registerFlag('plan', {
    description: 'Start in plan mode (read-only exploration)',
    type: 'boolean',
    default: false,
  });

  // ── Commands ───────────────────────────────────────────────

  pi.registerCommand('plan', {
    description: 'Toggle plan mode (read-only exploration)',
    handler: async (_args, ctx) => {
      ensureStatePath(ctx);
      const msg = await togglePlanMode();
      pi.sendMessage(
        { customType: 'plan-mode-toggle', content: msg, display: true },
        { triggerTurn: false },
      );
      persistEntry();
    },
  });

  pi.registerCommand('plan-execute', {
    description: 'Execute the current plan',
    handler: async (_args, ctx) => {
      ensureStatePath(ctx);
      if (steps.length === 0) {
        pi.sendMessage(
          { content: 'No plan steps. Create a plan first with /plan.', display: true },
          { triggerTurn: false },
        );
        return;
      }
      await enterExecutionMode();
      const first = steps.find((s) => !s.completed);
      const msg = first
        ? `Executing plan. Starting with step ${first.step}: ${first.text}`
        : 'All steps already completed.';
      pi.sendMessage(
        { customType: 'plan-mode-execute', content: msg, display: true },
        { triggerTurn: true },
      );
      persistEntry();
    },
  });

  pi.registerCommand('plan-todos', {
    description: 'Show current plan progress',
    handler: async (_args, ctx) => {
      ensureStatePath(ctx);
      if (steps.length === 0) {
        pi.sendMessage(
          { content: 'No plan steps yet.', display: true },
          { triggerTurn: false },
        );
        return;
      }
      const done = steps.filter((s) => s.completed).length;
      const list = steps
        .map((s) => `${s.step}. ${s.completed ? '✓' : '○'} ${s.text}`)
        .join('\n');
      pi.sendMessage(
        { content: `**Plan (${done}/${steps.length}):**\n\n${list}`, display: true },
        { triggerTurn: false },
      );
    },
  });

  // ── Event: block destructive bash in plan mode ─────────────

  pi.on('tool_call', async (event) => {
    if (currentMode !== 'plan' || event.toolName !== 'bash') return;
    const command = event.input.command as string;
    if (!isSafeCommand(command)) {
      return {
        block: true,
        reason: `Plan mode: command blocked. Use /plan to disable first.\nCommand: ${command}`,
      };
    }
  });

  // ── Event: filter stale plan context ───────────────────────

  pi.on('context', async (event) => {
    if (currentMode === 'plan') return;
    return {
      messages: event.messages.filter((m) => {
        const msg = m as Record<string, unknown>;
        return msg.customType !== 'plan-mode-context';
      }),
    };
  });

  // ── Event: inject plan/execution context ───────────────────

  pi.on('before_agent_start', async () => {
    if (currentMode === 'plan') {
      return {
        message: {
          customType: 'plan-mode-context',
          content: `[PLAN MODE ACTIVE]
You are in plan mode — a read-only exploration mode for safe code analysis.

Restrictions:
- You can only use: read, bash, grep, find, ls, questionnaire, plan_todos
- You CANNOT use: edit, write (file modifications are disabled)
- Bash is restricted to an allowlist of read-only commands

After exploring the codebase, create your plan by calling the plan_todos tool:
  plan_todos({ action: "set_plan", steps: ["Step 1 description", "Step 2 description", ...] })

Do NOT attempt to make changes — just describe what you would do.
Always finish by calling plan_todos with set_plan to save your plan.`,
          display: false,
        },
      };
    }

    if (currentMode === 'execute' && steps.length > 0) {
      const remaining = steps.filter((s) => !s.completed);
      const list = remaining.map((s) => `${s.step}. ${s.text}`).join('\n');
      return {
        message: {
          customType: 'plan-execution-context',
          content: `[EXECUTING PLAN — Full tool access enabled]

Remaining steps:
${list}

Execute each step in order.
After completing each step, call: plan_todos({ action: "complete_step", step: <number> })`,
          display: false,
        },
      };
    }
  });

  // ── Event: archive + reset on plan completion ──────────────

  pi.on('agent_end', async (_event, ctx) => {
    ensureStatePath(ctx);
    if (currentMode !== 'execute' || steps.length === 0) return;
    if (!steps.every((s) => s.completed)) return;

    // Archive before resetting
    await archivePlan();

    pi.sendMessage(
      { customType: 'plan-complete', content: `**Plan Complete!** ✓`, display: true },
      { triggerTurn: false },
    );
    currentMode = 'normal';
    steps = [];
    pi.setActiveTools(NORMAL_MODE_TOOLS);
    await syncStateToFile();
    persistEntry();
  });

  // ── Event: restore state on session start ──────────────────

  pi.on('session_start', async (_event, ctx) => {
    ensureStatePath(ctx);

    if (pi.getFlag('plan') === true) {
      currentMode = 'plan';
    }

    // Restore from persisted entries
    const entries = ctx.sessionManager.getEntries();
    const planEntry = entries
      .filter(
        (e: { type: string; customType?: string }) =>
          e.type === 'custom' && e.customType === 'plan-mode',
      )
      .pop() as { data?: { mode: PlanMode; steps?: PlanStep[] } } | undefined;

    if (planEntry?.data) {
      currentMode = planEntry.data.mode ?? currentMode;
      steps = planEntry.data.steps ?? steps;
    }

    if (currentMode === 'plan') {
      pi.setActiveTools(PLAN_MODE_TOOLS);
    }
    await syncStateToFile();
  });

  pi.on('session_switch', async (_event, ctx) => {
    ensureStatePath(ctx);
  });
}
