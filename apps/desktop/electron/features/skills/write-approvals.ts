/**
 * One-time approvals for a runtime skill write (spec 18 — skill extraction).
 *
 * The problem this solves: a plugin runtime's actions are reachable through the
 * plugin's own agent tool, so a model can call them. A skill file is
 * profile-global prompt content, which would make "write a skill" a persistence
 * path for anything that can talk to the model.
 *
 * The fix is a channel a model does not have. The RENDERER — the Orchestrator
 * app, driven by the person clicking Save — approves one write over IPC, naming
 * the pending draft and a hash of the exact bytes it is about to send. The
 * approval lives in main-process memory only: never on disk, never in the
 * workspace, never in a tool result, so nothing a model can read or write can
 * produce one.
 *
 * Each approval is bound to one draft AND one content hash, expires quickly, and
 * is consumed on first use. A model that calls `save_skill` on its own — or that
 * races the user with different content — finds no matching approval and is
 * refused.
 */

import { createHash } from 'crypto';

/** Long enough for the save round trip, short enough to be useless later. */
const APPROVAL_TTL_MS = 120_000;

interface StoredApproval {
  contentHash: string;
  expiresAt: number;
}

/** scope (`<loopId>:<draftId>`) → the single approval outstanding for it. */
const approvals = new Map<string, StoredApproval>();

/**
 * The canonical hash of what a write would do: the exact content AND the
 * authority to replace something.
 *
 * Structured, not concatenated. A description may legitimately contain newlines,
 * so `name\ndescription\nbody` has no unique reading: moving a line across the
 * description/body boundary produces the same preimage from different content.
 * JSON escapes the separators inside each field, so one digest has one meaning.
 *
 * `overwrite` is part of it because it is a separate authority. Without it, an
 * approval the user gave by pressing Save could be spent on a write that
 * replaces an existing skill — a Replace they never pressed.
 */
export function skillContentHash(input: {
  name: string;
  description: string;
  body: string;
  overwrite?: boolean;
}): string {
  const canonical = JSON.stringify([input.name, input.description, input.body, input.overwrite === true]);
  return createHash('sha256').update(canonical).digest('hex');
}

function prune(now: number): void {
  for (const [scope, approval] of approvals) {
    if (approval.expiresAt <= now) approvals.delete(scope);
  }
}

/** Renderer → main: this exact content may be written once, soon. */
export function approveSkillWrite(scope: string, contentHash: string, now = Date.now()): void {
  if (!scope.trim() || !/^[0-9a-f]{64}$/.test(contentHash)) {
    throw new Error('A skill write approval needs a scope and a sha256 content hash.');
  }
  prune(now);
  // One outstanding approval per draft: re-approving replaces, never stacks.
  approvals.set(scope, { contentHash, expiresAt: now + APPROVAL_TTL_MS });
}

/**
 * Consumes the approval for this scope when it matches the content. Returns
 * false for a missing, expired, or mismatched approval — and consumes nothing,
 * so a wrong guess cannot burn the user's pending approval.
 */
export function consumeSkillWriteApproval(scope: string, contentHash: string, now = Date.now()): boolean {
  prune(now);
  const approval = approvals.get(scope);
  if (!approval || approval.contentHash !== contentHash) return false;
  approvals.delete(scope);
  return true;
}

export function resetSkillWriteApprovalsForTests(): void {
  approvals.clear();
}
