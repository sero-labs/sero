/**
 * Receipt verify-back (spec 13): where a read API is free, the engine
 * cross-checks an accepted receipt instead of taking the agent's word —
 * `pr` against the live open-PR list, `saved-artifact` against file existence.
 * Management-plane observation only (the listPullRequests/runCommand carve-out).
 *
 * Fail-soft on observation errors: if the check itself cannot run (no gh, no
 * shell), the structural contract has already passed and the receipt stands —
 * verify-back tightens the gate where it can, it never adds a new failure mode.
 */

import type { Loop, LoopStepDefinition, StepOutcome } from '../../shared/types';
import type { DeliveryReceipt } from '../../shared/delivery-types';
import type { OrchestratorHost } from '../host';
import { downgradeDelivery, enforceDeliveryContract, receiptRequirement } from './delivery-contract';

export type VerifyResult = { ok: true } | { ok: false; reason: string };

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export async function verifyReceipt(host: OrchestratorHost, loop: Loop, receipt: DeliveryReceipt): Promise<VerifyResult> {
  if (receipt.destination === 'pr') {
    const open = await host.listPullRequests().catch(() => undefined);
    if (open === undefined) return { ok: true };
    const ref = receipt.ref.trim();
    // URL match covers both a PR this run opened and an existing PR it updated
    // (spec 15 — same URL); the /pull/<n> number match tolerates a ref whose
    // URL form differs from the list's (host casing, trailing segments).
    const refNumber = /\/pull\/(\d+)(?:[/#?]|$)/.exec(ref)?.[1];
    const matches = open.some(
      (pr) =>
        ref === pr.url || ref.startsWith(`${pr.url}/`) || ref.startsWith(`${pr.url}#`) || (refNumber !== undefined && Number(refNumber) === pr.number),
    );
    return matches ? { ok: true } : { ok: false, reason: `no open pull request matches the receipt ref "${receipt.ref}"` };
  }
  if (receipt.destination === 'saved-artifact') {
    // The step wrote the file in its own cwd (worktree or workspace root), but
    // runCommand always runs at the workspace root — resolve relative refs first.
    const ref = receipt.ref.trim();
    const cwd = loop.runtime.workspace.resolved?.cwd ?? host.workspacePath;
    const path = ref.startsWith('/') ? ref : `${cwd}/${ref}`;
    const result = await host.runCommand(`test -f ${shellQuote(path)}`).catch(() => undefined);
    if (result === undefined) return { ok: true };
    return result.exitCode === 0 ? { ok: true } : { ok: false, reason: `the receipt file "${receipt.ref}" does not exist (checked ${path})` };
  }
  return { ok: true }; // other destinations rely on the receipt contract in v1
}

/**
 * The engine's single delivery seam: structural backstop first (pure), then
 * verify-back on a structurally accepted receipt. A verify-back failure
 * downgrades exactly like a missing receipt.
 */
export async function applyDeliveryContract(
  host: OrchestratorHost,
  loop: Loop,
  step: LoopStepDefinition,
  outcome: StepOutcome,
): Promise<StepOutcome> {
  const enforced = enforceDeliveryContract(loop, step, outcome);
  if (enforced !== outcome) return enforced;
  const requirement = receiptRequirement(loop, step);
  const receipt = outcome.completion?.status === 'complete' ? outcome.completion.receipt : undefined;
  if (!requirement || !receipt) return outcome;
  const verified = await verifyReceipt(host, loop, receipt);
  if (verified.ok) return outcome;
  host.log(`Loop ${loop.id}: delivery receipt failed verify-back — ${verified.reason}`);
  return downgradeDelivery(requirement, outcome, [verified.reason]);
}
