/**
 * Opens a session at a call site and runs a probe's steps in it.
 */
import { promptAndCollectEvents } from '../agent';
import { STUB_MODEL_ID, STUB_PROVIDER_ID } from '../stub-model';
import { chatResultReader, type ToolCheckApp } from './app';
import type { RunOutcome } from './driver';
import type { ScenarioStep, StepContext, ToolCheckFixtures, ToolCheckSite } from './types';

export function stepContext(check: ToolCheckApp, site: ToolCheckSite, fixtures: ToolCheckFixtures): StepContext {
  return { workspaceId: check.workspaceId, workspacePath: check.workspaceDir, runtime: check.runtime, site, fixtures, state: {}, page: check.page, respondWith: check.respondWith };
}

/** A new chat on the stub model, in the check's workspace. */
export async function openChat(check: ToolCheckApp): Promise<string> {
  return check.page.evaluate(async ({ id, provider, model }) => {
    const created = await window.sero.sessions.create(id);
    await window.sero.agent.open(created.id, created.path, id);
    await window.sero.agent.setModel(created.id, provider, model);
    return created.id;
  }, { id: check.workspaceId, provider: STUB_PROVIDER_ID, model: STUB_MODEL_ID });
}

export interface ChatRun {
  tool: string;
  steps: ScenarioStep[];
  via: 'direct' | 'cli';
  fixtures: ToolCheckFixtures;
  /** Turn limit for the whole run. */
  timeoutMs?: number;
}

/** Runs the steps in a new chat, one turn per step, and returns how far they got. */
export async function runInChat(check: ToolCheckApp, run: ChatRun): Promise<RunOutcome> {
  const prompt = `tool-check ${run.tool} ${run.via}`;
  const outcome = check.driver.add({
    prompt,
    tool: run.tool,
    steps: run.steps,
    via: run.via,
    ctx: stepContext(check, 'chat', run.fixtures),
    readResult: chatResultReader(check.page),
  });
  const sessionId = await openChat(check);
  await promptAndCollectEvents(check.page, sessionId, prompt, run.timeoutMs ?? 120_000);
  return outcome;
}
