/**
 * The Workflow worker call site. A chat creates a one-step Orchestrator loop
 * through `sero-cli orchestrator` and runs it. The stub answers the planner
 * and the trigger extractor, and the scenario driver runs the probe's steps
 * in the step's background-agent session.
 */
import { promptAndCollectEvents } from '../agent';
import type { StubRequest } from '../stub-model';
import { chatResultReader, type ToolCheckApp } from './app';
import { cliCommandFor } from './command-line';
import { firstUserText, type RunOutcome } from './driver';
import { openChat, releaseResponders, stepContext, type ChatRun } from './sites';
import { surfaceOf, type SessionSurface } from './surface';

// Markers in the Orchestrator's system prompts (plugins/sero-orchestrator-plugin/runtime).
export const PLANNER = 'You are the PLANNER for Sero Orchestrator';
export const TRIGGER = 'You decide ONLY how a task should be TRIGGERED';
export const STEP = 'You are executing ONE step of a Sero Orchestrator loop';

/** The tools every step session is given (`DEFAULT_TOOLS` in the plugin's shared/constants.ts). */
export const STEP_TOOLS = ['bash', 'read', 'write', 'edit', 'sero-cli'];

export interface WorkerOutcome extends RunOutcome {
  /** What the step session was given. */
  surface: SessionSurface;
  /** The `orchestrator create` result the launching chat received. */
  createResult: string;
}

/** A real model's step: its own instructions, and a `provider/modelId` pin in place of the stub's tier. */
export interface RealStep {
  instructions: string;
  model: string;
  thinking: string;
}

/** One background-agent step. A tool outside the default loadout is added to the step's tools. */
export function planningReply(goal: string, tool: string, defaultTools: boolean, real?: RealStep): string {
  const extra = defaultTools || STEP_TOOLS.includes(tool) || tool.startsWith('sero ') ? [] : [tool];
  const execution = real
    ? { type: 'background-agent', model: real.model, thinking: real.thinking }
    : { type: 'background-agent', model: 'LOW', ...(extra.length ? { tools: extra } : {}) };
  return JSON.stringify({
    schemaVersion: 1,
    title: goal,
    summary: 'One step runs the tool check.',
    plan: {
      schemaVersion: 1,
      revision: 0,
      objective: goal,
      steps: [{
        id: 'tool-check',
        title: goal,
        instructions: real?.instructions ?? `Run the ${tool} tool check, then report the outcome.`,
        expectedOutcome: 'Every check step ran.',
        execution,
      }],
    },
  });
}

/** The StepOutcome the step session ends on. The single step is the loop's last, so it completes the loop. */
function stepOutcome(outcome: RunOutcome): string {
  const summary = outcome.failure === undefined ? `${outcome.passed} check steps passed` : `stopped: ${outcome.failure}`;
  return `Tool check done.\n\`\`\`json\n${JSON.stringify({ status: 'succeeded', summary, completion: { status: 'complete', reason: summary } })}\n\`\`\``;
}

export async function runInWorkflowWorker(check: ToolCheckApp, run: ChatRun): Promise<WorkerOutcome> {
  const goal = `tool-check ${run.tool} ${run.via} workflow-worker${run.label ? ` ${run.label}` : ''}`;
  const launch = `launch ${goal}`;
  const launchCallId = `tc-launch-${goal.replace(/[^a-zA-Z0-9]/g, '-')}`;
  const isStep = (request: StubRequest) => request.system.includes(STEP) && firstUserText(request).includes(goal);

  const remove = check.respondWith((request) => {
    const first = firstUserText(request);
    if (first === launch) {
      if (request.messages.some((message) => message.role === 'tool')) return { text: 'loop finished' };
      // The workspace holds files earlier probes wrote, so it is not clean.
      const command = cliCommandFor('orchestrator', { action: 'create', prompt: goal, useManagedWorktree: false, allowDirtyWorkspaceRoot: true, activate: true });
      return { toolCalls: [{ id: launchCallId, name: 'sero-cli', arguments: { command } }] };
    }
    if (!first.includes(goal)) return undefined;
    if (request.system.includes(PLANNER)) return { text: planningReply(goal, run.tool, run.defaultTools === true) };
    if (request.system.includes(TRIGGER)) return { text: JSON.stringify({ recurring: false, schedule: null, events: [] }) };
    return undefined;
  });

  const ctx = stepContext(check, 'workflow-worker', run.fixtures);
  try {
    const outcome = check.driver.add({
      prompt: goal,
      matches: isStep,
      finalText: stepOutcome,
      tool: run.tool,
      steps: run.steps,
      via: run.via,
      continueOnFailure: run.continueOnFailure,
      ctx,
    });
    const sessionId = await openChat(check);
    // `create` with `activate` returns once the loop has run, so the chat's turn ends after the step.
    await promptAndCollectEvents(check.page, sessionId, launch, run.timeoutMs ?? 180_000);
    const created = await chatResultReader(check.page)(launchCallId);
    const surface = surfaceOf(check.stub.server, isStep);
    if (!surface) throw new Error(`the Workflow step never reached the stub. create said: ${created?.text ?? 'nothing'}`);
    return { ...(await outcome), surface, createResult: created?.text ?? '' };
  } finally {
    remove();
    releaseResponders(ctx);
  }
}
