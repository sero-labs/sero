/**
 * Static delivery-destination registry (v1, spec 13). What the planner and the
 * engine know about each destination: the planner rules injected in place of
 * the old hardcoded delivery strings, the tools the delivery step needs, and
 * what its receipt "ref" must be. Prompt text lives here (runtime-side);
 * label/external come from the renderer-safe shared table so they cannot drift.
 *
 * Adding a destination = one entry here + one row in DELIVERY_DESTINATIONS.
 */

import type { DeliveryDestinationId } from '../../shared/delivery-types';
import { deliveryDestinationInfo } from '../../shared/delivery-types';

export interface DeliveryDestinationSpec {
  id: DeliveryDestinationId;
  label: string;
  /** Externally visible ⇒ the final send is approval-gated (fixed v1 rule). */
  external: boolean;
  /** Additional tools (beyond the defaults) the delivery step needs, matched against the live catalog. */
  requiredTools: string[];
  /** Planner guidance: the delivery step(s) to author for this destination. */
  plannerRules: string;
  /** What the receipt "ref" must be, injected into the final-step contract. */
  receiptHint: string;
}

/**
 * Replaces the `pr` planner rules when the loop works ON an existing PR
 * (worktreeBranchSource: 'event-pr', spec 15): the workspace is already
 * checked out at the PR's own branch, so delivery is a push, never a new PR.
 */
export const PR_UPDATE_PLANNER_RULES =
  "This loop responds to an existing pull request: the workspace is checked out at that PR's OWN branch. Deliver by committing the change on the current branch with a clear message and pushing it — the PR updates automatically. NEVER open a new pull request and never switch branches. After pushing, comment on the PR (gh pr comment) describing what changed and why. The FIRST step should read the firing event context plus the PR itself (gh pr view, gh pr diff) to understand what is being responded to.";

const EXTERNAL_STAGING =
  'This is externally visible, so the plan MUST stage it: one step composes the content; a separate step marked "gate": "approval" presents that exact content to the user for approval (per HUMAN APPROVAL / INPUT GATES — it records the decision in a "produces" variable); and the step that actually delivers depends on the gate step and is guarded ("when") so it only runs once approved. The final step must (transitively) depend on the gate step. Never deliver without the recorded approval — an unapproved delivery is refused mechanically. If the user rejects, deliver nothing: route past the send and report honestly (a one-shot loop completes as "blocked").';

const RULES: Record<DeliveryDestinationId, Pick<DeliveryDestinationSpec, 'requiredTools' | 'plannerRules' | 'receiptHint'>> = {
  pr: {
    requiredTools: [],
    plannerRules:
      'The result must be delivered as a pull request or it is lost. After the change is made and verified, add a step that commits it on the current branch with a clear message; if the repository has a git remote and the `gh` CLI is available, that step should also push the branch and open a pull request describing the change. For a recurring loop, the FIRST step should review any open pull requests listed in its run context and skip work an open PR already covers before implementing.',
    receiptHint: 'the pull request URL (the PR this run opened, or the existing PR it updated)',
  },
  'workspace-files': {
    requiredTools: [],
    plannerRules:
      'No delivery step is needed — the results stay in the user\'s workspace files, so no commit or PR is needed; leave the changes in the working tree unless the goal explicitly asks to commit. The finalization step just verifies the work and emits completion.',
    receiptHint: 'not required — results stay in the working tree',
  },
  'saved-artifact': {
    requiredTools: [],
    plannerRules:
      'The result must be delivered as a saved report file. Add a step that writes the final result to ONE file in the workspace — use the declared delivery params for the name/path when given, otherwise pick a clear path like reports/<topic>-<date>.md — and records that exact path for the finalization step.',
    receiptHint: 'the saved file path, exactly as written',
  },
  'email-draft': {
    requiredTools: ['gmail'],
    plannerRules:
      'The result must be delivered as a Gmail DRAFT — composed but never sent. Add a step that composes the content and creates the draft with the "gmail" tool (add "gmail" to that step\'s "execution.tools"), honoring any recipients/subject in the declared delivery params. Do not add any step that sends mail.',
    receiptHint: 'the Gmail draft id',
  },
  'email-send': {
    requiredTools: ['gmail'],
    plannerRules: `The result must be delivered by SENDING an email with the "gmail" tool (add "gmail" to the sending step's "execution.tools"), honoring any recipients/subject in the declared delivery params. ${EXTERNAL_STAGING}`,
    receiptHint: 'the Gmail message id of the sent email',
  },
  'chat-post': {
    requiredTools: ['mcp'],
    plannerRules: `The result must be delivered by posting a message to the chat channel in the declared delivery params, through the connected chat integration via the "mcp" tool (add "mcp" to the posting step's "execution.tools"). ${EXTERNAL_STAGING}`,
    receiptHint: 'the posted message permalink (or channel plus message timestamp)',
  },
  'webhook-post': {
    requiredTools: [],
    plannerRules: `The result must be delivered by an HTTP POST to the webhook URL in the declared delivery params (curl from a background-agent step is fine); the step must capture the response status. ${EXTERNAL_STAGING}`,
    receiptHint: 'the webhook URL plus the HTTP response status (e.g. "POST https://… → 200")',
  },
};

export function deliverySpec(id: DeliveryDestinationId): DeliveryDestinationSpec {
  const info = deliveryDestinationInfo(id);
  return { id, label: info.label, external: info.external, ...RULES[id] };
}
