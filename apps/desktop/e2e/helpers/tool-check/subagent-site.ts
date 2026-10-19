/**
 * The subagent call site. A chat calls `subagent` with an inline system
 * prompt, and the scenario driver runs the probe's steps in the subagent's
 * own session.
 */
import { promptAndCollectEvents } from '../agent';
import type { StubRequest } from '../stub-model';
import { chatResultReader, type ToolCheckApp } from './app';
import { firstUserText, type RunOutcome } from './driver';
import { openChat, stepContext, type ChatRun } from './sites';
import { surfaceOf, type SessionSurface } from './surface';
import type { ToolCheckSite } from './types';

export interface SubagentOutcome extends RunOutcome {
  /** What the subagent session was given. */
  surface: SessionSurface;
  /** The text the launching chat got back from `subagent`. */
  subagentResult: string;
}

/** Runs the steps in a subagent started from a new chat. `site` is `codemode-subagent` when the steps run from scripts. */
export async function runInSubagent(check: ToolCheckApp, run: ChatRun, site: ToolCheckSite = 'subagent'): Promise<SubagentOutcome> {
  const goal = `tool-check ${run.tool} ${run.via} ${site}${run.label ? ` ${run.label}` : ''}`;
  const launch = `launch ${goal}`;
  const launchCallId = `tc-launch-${goal.replace(/[^a-zA-Z0-9]/g, '-')}`;
  const timeoutMs = run.timeoutMs ?? 180_000;
  const isSubagent = (request: StubRequest) => {
    const first = firstUserText(request);
    return first !== launch && first.includes(goal);
  };

  const remove = check.respondWith((request) => {
    if (firstUserText(request) !== launch) return undefined;
    if (request.messages.some((message) => message.role === 'tool')) return { text: 'subagent finished' };
    return {
      toolCalls: [{
        id: launchCallId,
        name: 'subagent',
        arguments: { systemPrompt: 'You run tool checks.', task: goal, timeoutMs },
      }],
    };
  });

  try {
    const outcome = check.driver.add({
      prompt: goal,
      matches: isSubagent,
      tool: run.tool,
      steps: run.steps,
      via: run.via,
      continueOnFailure: run.continueOnFailure,
      ctx: stepContext(check, site, run.fixtures),
    });
    const sessionId = await openChat(check);
    await promptAndCollectEvents(check.page, sessionId, launch, timeoutMs + 30_000);
    const returned = await chatResultReader(check.page)(launchCallId);
    const surface = surfaceOf(check.stub.server, isSubagent);
    if (!surface) throw new Error(`the subagent never reached the stub. subagent said: ${returned?.text ?? 'nothing'}`);
    return { ...(await outcome), surface, subagentResult: returned?.text ?? '' };
  } finally {
    remove();
  }
}
