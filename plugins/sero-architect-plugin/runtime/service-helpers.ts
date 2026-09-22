/**
 * Workspace inspection and small shared helpers.
 *
 * Split from the service layer to keep each file within the 500-LOC limit.
 * The git helpers report what is actually checked out, so evidence names the
 * content it verified rather than only whether the tree was clean.
 */

import { createHash } from 'node:crypto';

import type { Milestone, ProjectRecord } from '../shared/record';
import type { ArchitectHost } from './host';

const EMPTY_TREE_COMMIT = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export function captureConfirmed(response: string): boolean {
  try {
    const verdict: unknown = JSON.parse(response);
    return typeof verdict === 'object' && verdict !== null && 'rendered' in verdict && verdict.rendered === true
      && 'summary' in verdict && typeof verdict.summary === 'string' && verdict.summary.trim().length > 0;
  } catch {
    return false;
  }
}
export function replaceMilestone(record: ProjectRecord, milestone: Milestone): ProjectRecord {
  return { ...record, milestones: record.milestones.map((m) => (m.id === milestone.id ? milestone : m)) };
}
export function researchTask(record: ProjectRecord, question: string, stoppingCondition: string): string {
  return [
    `You research one question for the software project in ${record.folder}. Answer it with facts you verified, name your sources, and say what you could not find out.`,
    '',
    `Question: ${question}`,
    `Stop when: ${stoppingCondition}`,
    '',
    'Reply with the answer as plain text, at most 600 words.',
  ].join('\n');
}
/** Remaining budget for one dispatched run, so a Workflow never starts with more than the project has left. */
export function remainingUsd(record: ProjectRecord): number | undefined {
  if (record.budget.capUsd === null) return undefined;
  return Math.max(0, record.budget.capUsd - record.budget.spentUsd);
}
export async function commitOf(host: ArchitectHost, folder: string): Promise<string> {
  const head = await host.exec('git', ['rev-parse', 'HEAD'], folder);
  return head.exitCode === 0 ? head.stdout.trim() : EMPTY_TREE_COMMIT;
}
export async function untrackedFiles(host: ArchitectHost, folder: string): Promise<string[]> {
  const result = await host.exec('git', ['ls-files', '--others', '--exclude-standard', '-z', '--', '.', ':(exclude).sero'], folder);
  if (result.exitCode !== 0) throw new Error(`git could not list untracked files: ${result.stderr.trim() || result.stdout.trim()}`);
  return result.stdout.split('\0').filter(Boolean).sort();
}
export async function diffSummaryOf(host: ArchitectHost, folder: string, baseCommit: string): Promise<string | null> {
  const stat = await host.exec('git', ['diff', '--stat', baseCommit, '--', '.', ':(exclude).sero'], folder);
  if (stat.exitCode !== 0) throw new Error(`git could not summarize changes from ${baseCommit}: ${stat.stderr.trim() || stat.stdout.trim()}`);
  const untracked = await untrackedFiles(host, folder);
  const lines = [stat.stdout.trim(), untracked.length > 0 ? `untracked:\n${untracked.join('\n')}` : ''].filter(Boolean);
  return lines.length > 0 ? lines.join('\n') : null;
}
/** Hashes the actual checked content, not only whether the tree is dirty. */
export async function worktreeFingerprint(host: ArchitectHost, folder: string): Promise<string> {
  const head = await commitOf(host, folder);
  const tracked = await host.exec('git', ['diff', '--binary', head, '--', '.', ':(exclude).sero'], folder);
  if (tracked.exitCode !== 0) throw new Error(`git could not fingerprint tracked files: ${tracked.stderr.trim() || tracked.stdout.trim()}`);
  const untracked = await untrackedFiles(host, folder);
  const hash = createHash('sha256').update(head).update('\0').update(tracked.stdout);
  for (const file of untracked) {
    const content = await host.exec('git', ['hash-object', '--', file], folder);
    if (content.exitCode !== 0) throw new Error(`git could not fingerprint ${file}: ${content.stderr.trim() || content.stdout.trim()}`);
    hash.update('\0').update(file).update('\0').update(content.stdout.trim());
  }
  return hash.digest('hex');
}

/** True when any checked tracked or untracked content moved after evidence ran. */
export async function evidenceIsStale(host: ArchitectHost, record: ProjectRecord, milestone: Milestone): Promise<boolean> {
  if (!milestone.evidence) return false;
  if (!milestone.evidence.fingerprint) return true;
  return (await worktreeFingerprint(host, record.folder)) !== milestone.evidence.fingerprint;
}
