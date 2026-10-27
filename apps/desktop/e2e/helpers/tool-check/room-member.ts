/**
 * Runs the `rooms` probe in a chat, and the `room` probe and the Room member
 * site pass in one of the Room's members. `room` refuses a session that is not a Room member, so it can only
 * run inside a Room, and the `rooms` probe builds one. The reviewer's turns
 * are the driver's; the planner and the other members are the stub's
 * (probes/rooms-stub.ts). The generic action pass must skip both tools and
 * call this instead.
 */
import type { ToolCheckApp } from './app';
import { settleWithin } from './architect-pair';
import type { RunOutcome } from './driver';
import { interruptReviewer } from './hosted-cancel';
import { hostedSitePass } from './hosted-site';
import { requiredActions } from './ledger';
import { roomProbe } from './probes/room';
import { roomsProbe } from './probes/rooms';
import { identityText } from './probes/session-script';
import { runAt, type SiteSurface } from './site-pass';
import { stepContext } from './sites';
import type { ToolCheckFixtures } from './types';

/** How long the reviewer may take to finish after the `rooms` probe has. */
const MEMBER_GRACE_MS = 60_000;

/** One line for each run that failed or was lost. */
export async function runRoomsWithMember(check: ToolCheckApp, fixtures: ToolCheckFixtures, home: SiteSurface): Promise<string[]> {
  const via = home.route(roomsProbe.tool);
  if (!via) throw new Error(`the ${home.site} site is not given rooms`);
  check.ledger.plan([
    ...requiredActions([roomsProbe]).map(({ tool, action }) => ({ tool, action, site: home.site })),
    ...requiredActions([roomProbe]).map(({ tool, action }) => ({ tool, action, site: 'room-member' as const })),
  ]);
  const member = check.driver.add({
    prompt: 'tc-room-member',
    // A member's prompt names it.
    matches: (request) => identityText(request).includes('You are Tc Reviewer,'),
    tool: roomProbe.tool,
    steps: roomProbe.steps,
    via: 'cli',
    continueOnFailure: true,
    ctx: stepContext(check, 'room-member', fixtures),
    // The member's site pass follows its own `room` steps.
    stepsFor: hostedSitePass(check, 'room-member', roomProbe.tool, 'after', interruptReviewer(check)),
  });

  const failures: string[] = [];
  const note = (who: string, outcome: RunOutcome | undefined) => {
    if (!outcome) failures.push(`${who}: the session did not finish`);
    else if (outcome.failure) failures.push(`${who}: ${outcome.failure}`);
  };
  note('rooms', await runAt(check, home.site, { tool: roomsProbe.tool, steps: roomsProbe.steps, via, fixtures, timeoutMs: roomsProbe.timeoutMs }));
  note('room (reviewer)', await settleWithin(member, MEMBER_GRACE_MS));
  return failures;
}
