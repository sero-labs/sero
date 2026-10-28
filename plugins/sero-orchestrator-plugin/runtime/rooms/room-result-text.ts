/**
 * What the invoking chat receives when a Room finishes (§23), and what a
 * finished Room's notice says.
 *
 * Split out of `room-delivery.ts` so the delivery rules stay readable and both
 * files stay inside the size limit. The text is derived from the Room's own
 * computed records, so a member cannot dress up how the Room finished.
 */

import type { RoomRecord } from './room-state';

/** Longest list the chat summary prints. A summary that grows without bound is a transcript. */
export const MAX_LISTED = 8;

export function formatRoomResult(record: RoomRecord, finalResult: string, problems: string[] = []): string {
  const { definition, runtime, brief } = record;
  // Work still open, questions nobody answered and members that ended blocked —
  // all computed by the coordinator, so "unresolved" is not the Conductor's
  // opinion of how tidy the Room was.
  const unresolved = [...brief.activeWork, ...brief.openQuestions, ...brief.blockers];
  const artifacts = record.artifacts.slice(-MAX_LISTED);
  const branches = record.delivery.unmergedBranches ?? [];
  const lines = [
    `Room "${definition.title}" ${completionState(record)}.`,
    '',
    finalResult.trim() || 'The Room finished without a written result.',
  ];
  if (artifacts.length > 0) {
    lines.push('', 'Artifacts:', ...artifacts.map((artifact) => `- ${artifact.title} (${artifact.kind}): ${artifact.ref}`));
  }
  // The work is on member branches, not in the user's files (#654). Saying so
  // here is the difference between a result they can act on and a false claim.
  if (branches.length > 0) {
    lines.push(
      '',
      'On member branches, not in your workspace files yet:',
      ...branches.map((branch) => `- ${branch.displayName}: ${branch.branch} (${commitCount(branch.commits)})`),
      'Merge them from the Room result or the Git app before the work is in your files.',
    );
  }
  if (unresolved.length > 0) {
    lines.push('', 'Still unresolved:', ...unresolved.slice(0, MAX_LISTED).map((item) => `- ${item}`));
  }
  if (problems.length > 0) {
    lines.push('', 'Delivery not completed:', ...problems.map((problem) => `- ${problem}`));
  }
  lines.push(
    '',
    `Took ${formatDuration(durationMs(record))} · ${runtime.usage.turns} turns · ${formatCost(runtime.usage.costUsd)}`,
    // No deep link: Sero has no URL scheme for a Room, so the id is what the
    // user (or the chat's agent) opens the Room with.
    `Room: ${definition.title} (${definition.id})`,
  );
  return lines.join('\n');
}

export function completionState(record: RoomRecord): string {
  const { status, stopReason } = record.runtime;
  // Delivery runs while the Room is still `completing` — that is what keeps the
  // crash marker up until the result is out — and to the reader it has finished.
  if (status === 'completed' || status === 'completing') return 'finished';
  return stopReason ? `stopped — ${stopReason.detail}` : `stopped (${status})`;
}

export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms) || ms < 0) return 'no recorded time';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return `${Math.round(ms / 1000)}s`;
  if (minutes < 60) return `${minutes}m`;
  const remainder = minutes % 60;
  return remainder ? `${Math.floor(minutes / 60)}h ${remainder}m` : `${Math.floor(minutes / 60)}h`;
}

function durationMs(record: RoomRecord): number | null {
  const { startedAt, endedAt } = record.runtime;
  if (!startedAt) return null;
  return Date.parse(endedAt ?? startedAt) - Date.parse(startedAt);
}

function formatCost(usd: number): string {
  return `$${usd.toFixed(usd < 0.1 ? 4 : 2)}`;
}

/** "1 commit", "3 commits" — a count the reader can weigh, not a bare number. */
export function commitCount(commits: number): string {
  return commits === 1 ? '1 commit' : `${commits} commits`;
}
