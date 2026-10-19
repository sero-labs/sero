/**
 * The real-model pass (design decision 7). Each site gets one short task on
 * deepseek-flash at high thinking: write a file, read it back, run one
 * command. The pass checks the file on disk and the app's own record of the
 * session's model and tool calls, never what the model says it did. The stub
 * still drives every launch and planner, so the only paid calls are each
 * site's own session.
 *
 * `SERO_TOOL_CHECK_REAL_MODEL=1` turns it on. Room members and the Architect
 * owner are not covered: their model is fixed when the app starts.
 */
import fs from 'node:fs';
import path from 'node:path';
import { promptAndCollectEvents } from '../agent';
import { hasLlmCredentials, TOOL_CHECK_LLM } from '../llm';
import type { SubagentEntry } from '../../../src/types/subagent';
import type { ToolCheckApp } from './app';
import { cliCommandFor } from './command-line';
import { firstUserText } from './driver';
import { openChat } from './sites';
import { planningReply, PLANNER, TRIGGER } from './workflow-worker';

export const REAL_MODEL_SITES = ['chat', 'codemode-chat', 'subagent', 'codemode-subagent', 'workflow-worker'] as const;
export type RealModelSite = (typeof REAL_MODEL_SITES)[number];

const MODEL = `${TOOL_CHECK_LLM.provider}/${TOOL_CHECK_LLM.modelId}`;
const TASK_TIMEOUT_MS = 300_000;

/** Why the pass does not run, or null when it does. */
export function realModelSkipReason(): string | null {
  if (process.env.SERO_TOOL_CHECK_REAL_MODEL !== '1') return 'SERO_TOOL_CHECK_REAL_MODEL is not 1';
  if (!hasLlmCredentials(TOOL_CHECK_LLM.provider)) return `no ${TOOL_CHECK_LLM.provider} API key is set`;
  return null;
}

interface Task {
  file: string;
  line: string;
  prompt: string;
}

function taskFor(site: RealModelSite): Task {
  const file = `real-model-${site}.txt`;
  const line = `written by a real model at ${site}`;
  const how = site.startsWith('codemode')
    ? 'Do all of it in one call to the codemode tool, with a script that calls the write, read and bash tools.'
    : 'Use the write, read and bash tools.';
  // The file name comes first: a subagent run's task preview is cut short.
  const prompt = `Write a file named ${file} in the workspace root containing exactly this line: ${line}\n`
    + `Then read the file back, and run \`git status --short\` with bash. ${how} Finish with one short sentence saying it is done.`;
  return { file, line, prompt };
}

/** What the app recorded about the session that did the task. */
interface Ran {
  model: string | null;
  tools: string[];
  cost: number;
}

/** Runs the site's task and returns why it failed, or null when it did as asked. Logs the session's cost. */
export async function runRealModelTask(check: ToolCheckApp, site: RealModelSite): Promise<string | null> {
  const task = taskFor(site);
  const target = path.join(check.workspaceDir, task.file);
  fs.rmSync(target, { force: true });
  const ran = site === 'chat' || site === 'codemode-chat' ? await inChat(check, task)
    : site === 'workflow-worker' ? await inWorkflowStep(check, task)
      : await inSubagent(check, task, site);
  if (!ran) return 'the app has no record of a session that ran the task';
  console.log(`real model at ${site}: ${ran.model}, tools ${ran.tools.join(', ') || 'none'}, cost $${ran.cost.toFixed(5)}`);

  if (!ran.model?.includes(TOOL_CHECK_LLM.modelId)) return `the task ran on ${ran.model ?? 'no model'}, not ${MODEL}`;
  if (site.startsWith('codemode') && !ran.tools.includes('codemode')) return `the task never called codemode: ${ran.tools.join(', ')}`;
  if (!fs.existsSync(target)) return `${task.file} was not written`;
  const written = fs.readFileSync(target, 'utf8').trim();
  if (written !== task.line) return `${task.file} holds "${written.slice(0, 200)}", not "${task.line}"`;
  return null;
}

async function inChat(check: ToolCheckApp, task: Task): Promise<Ran> {
  const sessionId = await openChat(check);
  try {
    await check.page.evaluate(async ({ id, provider, model, thinking }) => {
      await window.sero.agent.setModel(id, provider, model);
      await window.sero.agent.setThinkingLevel(id, thinking);
    }, { id: sessionId, provider: TOOL_CHECK_LLM.provider, model: TOOL_CHECK_LLM.modelId, thinking: TOOL_CHECK_LLM.thinking });
    const { events } = await promptAndCollectEvents(check.page, sessionId, task.prompt, TASK_TIMEOUT_MS);
    const usage = await check.page.evaluate((id) => window.sero.agent.getUsage(id), sessionId);
    return {
      model: await check.page.evaluate(async (id) => {
        const state = await window.sero.agent.getModelState(id);
        return state ? `${state.model.provider}/${state.model.modelId}:${state.thinkingLevel}` : null;
      }, sessionId),
      tools: events.flatMap((event) => (event.type === 'tool_start' ? [event.tool.toolName] : [])),
      cost: usage?.cost ?? 0,
    };
  } finally {
    await check.page.evaluate((id) => window.sero.agent.close(id), sessionId).catch(() => undefined);
  }
}

/** The app's record of a subagent run: a launched one by its call id, else the newest Workflow step's. */
async function subagentRun(check: ToolCheckApp, toolCallId?: string): Promise<Ran | null> {
  const entries: SubagentEntry[] = await check.page.evaluate((id) => window.sero.subagent.snapshot(id), check.workspaceId);
  const entry = toolCallId
    ? entries.find((run) => run.toolCallId === toolCallId)
    // A step's task opens with the loop's own framing, so it is found by its parent, the loop.
    : entries.filter((run) => run.parentSessionId.startsWith('orchestrator:')).sort((a, b) => b.startedAt - a.startedAt)[0];
  return entry ? { model: entry.model, tools: entry.toolActivity.map((activity) => activity.toolName), cost: entry.usage.cost } : null;
}

/** A stub chat launches the subagent, pinned to the real model, and the subagent does the task. */
async function inSubagent(check: ToolCheckApp, task: Task, site: RealModelSite): Promise<Ran | null> {
  const launch = `launch real-model ${site}`;
  const launchCallId = `tc-real-model-${site}`;
  const remove = check.respondWith((request) => {
    if (firstUserText(request) !== launch) return undefined;
    if (request.messages.some((message) => message.role === 'tool')) return { text: 'subagent finished' };
    return { toolCalls: [{ id: launchCallId, name: 'subagent', arguments: {
      systemPrompt: 'You carry out the task exactly as asked.', task: task.prompt,
      model: MODEL, thinking: TOOL_CHECK_LLM.thinking, timeoutMs: TASK_TIMEOUT_MS,
    } }] };
  });
  const sessionId = await openChat(check);
  try {
    await promptAndCollectEvents(check.page, sessionId, launch, TASK_TIMEOUT_MS + 30_000);
    return await subagentRun(check, launchCallId);
  } finally {
    remove();
    await check.page.evaluate((id) => window.sero.agent.close(id), sessionId).catch(() => undefined);
  }
}

/** A stub chat creates a one-step loop whose step is pinned to the real model, with the task as its instructions. */
async function inWorkflowStep(check: ToolCheckApp, task: Task): Promise<Ran | null> {
  const goal = 'real-model workflow-worker';
  const launch = `launch ${goal}`;
  const remove = check.respondWith((request) => {
    const first = firstUserText(request);
    if (first === launch) {
      if (request.messages.some((message) => message.role === 'tool')) return { text: 'loop finished' };
      const command = cliCommandFor('orchestrator', { action: 'create', prompt: goal, useManagedWorktree: false, allowDirtyWorkspaceRoot: true, activate: true });
      return { toolCalls: [{ id: 'tc-real-model-workflow', name: 'sero-cli', arguments: { command } }] };
    }
    if (!first.includes(goal)) return undefined;
    if (request.system.includes(PLANNER)) {
      return { text: planningReply(goal, 'real model', true, { instructions: task.prompt, model: MODEL, thinking: TOOL_CHECK_LLM.thinking }) };
    }
    if (request.system.includes(TRIGGER)) return { text: JSON.stringify({ recurring: false, schedule: null, events: [] }) };
    return undefined;
  });
  const sessionId = await openChat(check);
  try {
    // `create` with `activate` returns once the loop has run.
    await promptAndCollectEvents(check.page, sessionId, launch, TASK_TIMEOUT_MS + 60_000);
    return await subagentRun(check);
  } finally {
    remove();
    await check.page.evaluate((id) => window.sero.agent.close(id), sessionId).catch(() => undefined);
  }
}
