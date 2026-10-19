/**
 * Runs the Architect story. `architect` refuses a session that is not a
 * project's owner, and `architect_projects` refuses one that is, so the two
 * tools cannot run one after the other in a chat. This runs both at once: a
 * chat makes the user's calls, each project's owner session makes the owner's,
 * and the steps take turns (probes/architect-gate.ts). The generic action
 * pass must skip `architect` and `architect_projects` and call this instead.
 */
import { promptAndCollectEvents } from '../agent';
import { chatResultReader, type ToolCheckApp } from './app';
import { firstUserText, type RunOutcome, type RunStep, type StepRoute } from './driver';
import { stopAndResumeOwner } from './hosted-cancel';
import { hostedSitePass } from './hosted-site';
import { requiredActions } from './ledger';
import { architectProbe } from './probes/architect';
import { allowCards } from './probes/architect-support';
import { beginSequence, endSequence } from './probes/architect-gate';
import { architectProjectsProbe } from './probes/architect-projects';
import { stepsOf, STORY } from './probes/architect-story';
import { CHARTER_NAME } from './probes/architect-story-charter';
import { MAIN_NAME } from './probes/architect-story-setup';
import { architectWorkResponder } from './probes/architect-stub';
import { openChat, stepContext } from './sites';
import type { ToolCheckFixtures } from './types';

/** The Playwright test timeout the pair needs: two projects, a Workflow, a Room, evidence runs and a preview. */
export const ARCHITECT_PAIR_TIMEOUT_MS = 3_600_000;

/** How long an owner session may take to finish after the chat has. */
const OWNER_GRACE_MS = 60_000;

export interface ArchitectPairOutcome {
  /** One line for each step that failed or was lost, with the session that ran it. */
  failures: string[];
}

export async function runArchitectPair(
  check: ToolCheckApp,
  fixtures: ToolCheckFixtures,
  /** How the chat reaches `architect_projects`: directly, or through `sero-cli`. */
  chatVia: Extract<StepRoute, 'direct' | 'cli'> = 'cli',
): Promise<ArchitectPairOutcome> {
  check.ledger.plan([
    ...requiredActions([architectProbe]).map(({ tool, action }) => ({ tool, action, site: 'architect-owner' as const })),
    ...requiredActions([architectProjectsProbe]).map(({ tool, action }) => ({ tool, action, site: 'chat' as const })),
  ]);

  // The two sessions share what the steps save, such as the project id.
  const chatContext = stepContext(check, 'chat', fixtures);
  const ownerContext = { ...stepContext(check, 'architect-owner', fixtures), state: chatContext.state };

  beginSequence(STORY.length);
  allowCards.start(check.page);
  const stopAnswering = check.respondWith(architectWorkResponder);
  const failures: string[] = [];
  const note = (who: string, outcome: RunOutcome | undefined) => {
    if (!outcome) failures.push(`${who}: the session did not finish`);
    else if (outcome.failure) failures.push(`${who}: ${outcome.failure}`);
  };

  try {
    const owners = (['charter', 'main'] as const).map((project) => {
      const name = project === 'charter' ? CHARTER_NAME : MAIN_NAME;
      return check.driver.add({
        prompt: `tc-architect-owner-${project}`,
        // The owner's first message is its contract, which names the project.
        matches: (request) => firstUserText(request).includes(`You are the owner of Architect project "${name}"`),
        tool: 'architect',
        steps: stepsOf('owner', project) as RunStep[],
        via: 'cli',
        continueOnFailure: true,
        ctx: ownerContext,
        // The owner site pass runs once, in the first project's owner, before its story steps.
        ...(project === 'charter' ? { stepsFor: hostedSitePass(check, 'architect-owner', architectProbe.tool, 'before', stopAndResumeOwner(check)) } : {}),
      });
    });

    const prompt = 'tc-architect-pair chat';
    const chat = check.driver.add({
      prompt,
      tool: 'architect_projects',
      steps: stepsOf('chat') as RunStep[],
      via: chatVia,
      continueOnFailure: true,
      ctx: chatContext,
      readResult: chatResultReader(check.page),
    });
    const sessionId = await openChat(check);
    await promptAndCollectEvents(check.page, sessionId, prompt, ARCHITECT_PAIR_TIMEOUT_MS - 120_000);
    note('architect_projects', await chat);

    // The chat's last steps follow the owners' last, so the owners are done or lost.
    const settled = await Promise.all(owners.map((owner) => settleWithin(owner, OWNER_GRACE_MS)));
    note('architect (charter project)', settled[0]);
    note('architect (main project)', settled[1]);
  } finally {
    stopAnswering();
    allowCards.end();
    endSequence();
  }
  return { failures };
}

/** The outcome, or undefined if the session had not finished in time. */
export async function settleWithin(run: Promise<RunOutcome>, ms: number): Promise<RunOutcome | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), ms); });
  try {
    return await Promise.race([run, late]);
  } finally {
    clearTimeout(timer);
  }
}
