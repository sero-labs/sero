/**
 * Opens a session at a call site and runs a probe's steps in it.
 */
import { promptAndCollectEvents } from '../agent';
import { STUB_MODEL_ID, STUB_PROVIDER_ID } from '../stub-model';
import { chatResultReader, type ToolCheckApp } from './app';
import type { RunOutcome, RunStep, StepRoute } from './driver';
import type { StepContext, ToolCheckFixtures, ToolCheckSite } from './types';

const installed = new WeakMap<StepContext, Set<() => void>>();

/**
 * A run's step context. The responders its steps install are removed when the
 * run ends (`releaseResponders`), even after a failed step, so one probe's stub
 * never answers the next probe's model calls.
 */
export function stepContext(check: ToolCheckApp, site: ToolCheckSite, fixtures: ToolCheckFixtures): StepContext {
  const removers = new Set<() => void>();
  const ctx: StepContext = {
    workspaceId: check.workspaceId, workspacePath: check.workspaceDir, runtime: check.runtime, site, fixtures, state: {}, page: check.page,
    respondWith(responder) {
      const remove = check.respondWith(responder);
      const removeOnce = () => {
        removers.delete(removeOnce);
        remove();
      };
      removers.add(removeOnce);
      return removeOnce;
    },
  };
  installed.set(ctx, removers);
  return ctx;
}

/** Removes every responder the run's steps installed and left in place. */
export function releaseResponders(ctx: StepContext): void {
  for (const remove of [...(installed.get(ctx) ?? [])]) remove();
}

/**
 * A new chat on the stub model, in the check's workspace. The workspace is
 * opened first, as a user has it open before chatting in it: a probe that
 * creates a workspace moves the app to the new one.
 */
export async function openChat(check: ToolCheckApp): Promise<string> {
  await check.page.getByText('Tool Check', { exact: true }).first().click();
  return check.page.evaluate(async ({ id, provider, model }) => {
    const created = await window.sero.sessions.create(id);
    await window.sero.agent.open(created.id, created.path, id);
    await window.sero.agent.setModel(created.id, provider, model);
    return created.id;
  }, { id: check.workspaceId, provider: STUB_PROVIDER_ID, model: STUB_MODEL_ID });
}

export interface ChatRun {
  tool: string;
  steps: RunStep[];
  via: StepRoute;
  fixtures: ToolCheckFixtures;
  /** Turn limit for the whole run. */
  timeoutMs?: number;
  /** Keeps running steps after one fails, as a site pass does. */
  continueOnFailure?: boolean;
  /** Tells this run's sessions apart from another run of the same tool. */
  label?: string;
  /** A Workflow step gets only its default tools, as the site pass reads them, not the probe's tool added. */
  defaultTools?: boolean;
}

/** Runs the steps in a new chat, one turn per step, and returns how far they got. */
export async function runInChat(check: ToolCheckApp, run: ChatRun, site: ToolCheckSite = 'chat'): Promise<RunOutcome> {
  const prompt = `tool-check ${run.tool} ${run.via}${site === 'chat' ? '' : ` ${site}`}${run.label ? ` ${run.label}` : ''}`;
  const ctx = stepContext(check, site, run.fixtures);
  const outcome = check.driver.add({
    prompt,
    tool: run.tool,
    steps: run.steps,
    via: run.via,
    continueOnFailure: run.continueOnFailure,
    ctx,
    readResult: chatResultReader(check.page),
  });
  let sessionId: string | undefined;
  try {
    sessionId = await openChat(check);
    await promptAndCollectEvents(check.page, sessionId, prompt, run.timeoutMs ?? 120_000);
    return await outcome;
  } finally {
    releaseResponders(ctx);
    // A person closes chats they are done with. Leaving every probe's chat
    // open made each skill save reload about 60 sessions, past the CLI's 30 s.
    if (sessionId) await check.page.evaluate((id) => window.sero.agent.close(id), sessionId).catch(() => undefined);
  }
}
