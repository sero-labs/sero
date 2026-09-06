/**
 * What the runtime does FOR the owner: research through the subagent seam,
 * dispatch through the typed Orchestrator and Room handles, and evidence
 * through the workspace command, git and dev-server seams. The owner never
 * touches any of these; it asks, and is woken with the result.
 */

import path from 'node:path';

import { createOrchestratorRoom, requestOrchestratorAction, type AppRuntimeSubagentResult } from '@sero-ai/common';

import { charge, settle } from '../shared/lifecycle';
import type { EvidenceCommand, EvidenceRecord, Milestone, ProjectRecord, ResearchResult } from '../shared/record';
import type { WakeEvent } from '../shared/wake';
import type { ArchitectHost } from './host';
import type { OwnerServices } from './owner-actions';
import type { RecordStore } from './record-store';

export interface ServicesDeps {
  host: ArchitectHost;
  store: RecordStore;
  wake(projectId: string, wake: WakeEvent): void;
}

const COMMAND_TIMEOUT_MS = 10 * 60_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function replaceMilestone(record: ProjectRecord, milestone: Milestone): ProjectRecord {
  return { ...record, milestones: record.milestones.map((m) => (m.id === milestone.id ? milestone : m)) };
}

function researchTask(record: ProjectRecord, question: string, stoppingCondition: string): string {
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
function remainingUsd(record: ProjectRecord): number | undefined {
  if (record.budget.capUsd === null) return undefined;
  return Math.max(1, record.budget.capUsd - record.budget.spentUsd);
}

export async function commitOf(host: ArchitectHost, folder: string): Promise<string> {
  const head = await host.exec('git', ['rev-parse', 'HEAD'], folder);
  return head.exitCode === 0 ? head.stdout.trim() : 'no-commit';
}

async function diffSummaryOf(host: ArchitectHost, folder: string): Promise<string | null> {
  const stat = await host.exec('git', ['diff', '--stat', 'HEAD'], folder);
  const untracked = await host.exec('git', ['ls-files', '--others', '--exclude-standard'], folder);
  const lines = [stat.stdout.trim(), untracked.stdout.trim() ? `untracked:\n${untracked.stdout.trim()}` : ''].filter(Boolean);
  return lines.length > 0 ? lines.join('\n') : null;
}

export function createServices(deps: ServicesDeps): OwnerServices {
  const { host, store } = deps;

  const runPreview = async (
    record: ProjectRecord,
    milestone: Milestone,
    route: string,
    startedAt: number,
  ): Promise<NonNullable<EvidenceRecord['preview']>> => {
    const workspaceId = record.workspaceId;
    if (!workspaceId) return { route, smokePassed: false, capturePath: null };
    const command = await host.detectDevServerCommand(record.folder);
    if (!command) {
      host.log(`no dev server command detected in ${record.folder}; the preview check fails`);
      return { route, smokePassed: false, capturePath: null };
    }
    const server = await host.startDevServer({ workspaceId, workspacePath: record.folder, cwdPath: record.folder, command, name: `architect ${milestone.id}`, scope: 'workspace' });
    if (!server.url) {
      host.log(`dev server did not start: ${server.reason ?? 'no reason given'}`);
      return { route, smokePassed: false, capturePath: null };
    }
    const url = new URL(route, server.url).toString();
    let smokePassed = false;
    try {
      const response = await fetch(url);
      smokePassed = response.status < 500;
    } catch {
      smokePassed = false;
    }
    let capturePath: string | null = null;
    if (smokePassed) {
      const evidenceDir = path.join(record.folder, '.sero', 'apps', 'architect', 'evidence', milestone.id);
      const target = path.join(evidenceDir, `${await commitOf(host, record.folder)}.png`);
      // The capture is taken by a subagent through the CLI browser tools and
      // saved to a path the RUNTIME chose. It counts only when the file exists,
      // is a PNG, and was written after this run started.
      await host.runStructured({
        task: [
          `Open ${url} with \`sero app preview ${url}\`, wait for it to render, then save a screenshot with \`sero app screenshot --save ${target}\`.`,
          'Do nothing else. Reply with the word done.',
        ].join(' '),
        parentSessionId: `architect:${record.id}:evidence`,
        workspaceId,
        cwd: record.folder,
        timeoutMs: 3 * 60_000,
        platformTools: 'all',
      });
      const info = await host.fileInfo(target);
      if (info && info.mtimeMs >= startedAt && info.size > 0 && info.head.equals(PNG_SIGNATURE)) capturePath = target;
      else host.log(`capture for ${milestone.id} was not produced at ${target}`);
    }
    if (server.serverId) await host.stopDevServer(server.serverId).catch(() => false);
    return { route, smokePassed, capturePath };
  };

  const runEvidence = async (projectId: string, milestoneId: string, commands: string[], route: string | null): Promise<void> => {
    const startedAt = Date.now();
    const record = await store.read(projectId);
    const milestone = record?.milestones.find((m) => m.id === milestoneId);
    if (!record || !milestone || !record.workspaceId) return;
    const commit = await commitOf(host, record.folder);
    const ran: EvidenceCommand[] = [];
    for (const command of commands) {
      const began = Date.now();
      const result = await host.runCommand(record.workspaceId, record.folder, command, COMMAND_TIMEOUT_MS);
      ran.push({ command, exitCode: result.exitCode, output: [result.stdout, result.stderr].filter(Boolean).join('\n').slice(-4000), durationMs: Date.now() - began });
    }
    const preview = route ? await runPreview(record, milestone, route, startedAt) : null;
    const diffSummary = await diffSummaryOf(host, record.folder);
    const passed = ran.every((c) => c.exitCode === 0) && (preview === null || (preview.smokePassed && preview.capturePath !== null));
    const evidence: EvidenceRecord = { commit, checkedAt: host.now(), commands: ran, diffSummary, preview, passed, stale: false };
    const fresh = (await store.read(projectId)) ?? record;
    const current = fresh.milestones.find((m) => m.id === milestoneId) ?? milestone;
    const verified: Milestone = {
      ...current,
      status: current.status === 'done' ? 'done' : 'verifying',
      evidence,
      verification: passed ? 'verified' : (current.verification === 'accepted' || current.verification === 'delivered' ? current.verification : 'reported'),
    };
    await store.write(settle(replaceMilestone(fresh, verified), host.now()));
    const failures = ran.filter((c) => c.exitCode !== 0).map((c) => `"${c.command}" exited ${c.exitCode}`);
    const previewNote = preview ? (preview.smokePassed ? (preview.capturePath ? 'preview captured' : 'preview rendered but no capture was produced') : 'preview smoke check failed') : '';
    deps.wake(projectId, {
      kind: 'dispatch-complete',
      at: host.now(),
      items: [`evidence for milestone ${milestoneId} ${passed ? 'passed' : 'failed'} at commit ${commit}${failures.length ? `: ${failures.join(', ')}` : ''}${previewNote ? ` (${previewNote})` : ''}`],
    });
  };

  return {
    async research(record, request) {
      const id = host.newId('res');
      const startedAt = host.now();
      void (async () => {
        const result = await host.runStructured({
          task: researchTask(record, request.question, request.stoppingCondition),
          parentSessionId: `architect:${record.id}:research`,
          workspaceId: record.workspaceId ?? 'global',
          cwd: record.folder,
          timeoutMs: 15 * 60_000,
          platformTools: 'readOnly',
        }).catch((error: unknown): AppRuntimeSubagentResult => ({ response: '', error: error instanceof Error ? error.message : String(error) }));
        const entry: ResearchResult = {
          id,
          question: request.question,
          stoppingCondition: request.stoppingCondition,
          result: result.error ? `Research failed: ${result.error}` : result.response,
          costUsd: result.usage?.costUsd ?? 0,
          completedAt: host.now(),
        };
        const fresh = await store.read(record.id);
        if (!fresh) return;
        const charged = charge({ ...fresh, research: [...fresh.research, entry] }, 'research', entry.costUsd, host.now());
        await store.write(charged);
        deps.wake(record.id, { kind: 'quiet', at: host.now(), items: [`research ${id} finished (started ${startedAt}): ${request.question}`] });
      })();
      return { id };
    },

    async dispatch(record, milestone, request) {
      if (!record.workspaceId) throw new Error('The project has no workspace to dispatch into.');
      const maxCostUsd = remainingUsd(record);
      if (request.kind === 'workflow') {
        const result = await requestOrchestratorAction(record.workspaceId, {
          kind: 'create',
          prompt: request.prompt,
          title: milestone.title,
          options: { activate: true, limits: maxCostUsd === undefined ? {} : { maxCostUsd } },
        });
        if (!result.ok || !result.loopId) throw new Error(result.error ?? 'The Workflow was not created.');
        return { id: result.loopId, workspaceId: record.workspaceId };
      }
      const result = await createOrchestratorRoom(record.workspaceId, {
        mandate: request.prompt,
        limits: { ...(maxCostUsd === undefined ? {} : { maxCostUsd }), access: 'edit-workspace', deliveryDestination: 'workspace-files' },
      });
      if (!result.ok) throw new Error(result.error);
      return { id: result.roomId, workspaceId: record.workspaceId };
    },

    evidenceIsStale: (record, milestone) => evidenceIsStale(host, record, milestone),

    async evidence(record, milestone, request) {
      // Mark the run before it starts so the page shows "verifying" at once.
      const marked: Milestone = { ...milestone, status: milestone.status === 'done' ? 'done' : 'verifying', preview: request.route ? { route: request.route } : milestone.preview };
      await store.write(settle(replaceMilestone(record, marked), host.now()));
      void runEvidence(record.id, milestone.id, request.commands, request.route).catch((error: unknown) => {
        host.log(`evidence run for ${record.id}/${milestone.id} failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    },
  };
}

/** True when the tree moved past the commit the evidence was checked against. */
export async function evidenceIsStale(host: ArchitectHost, record: ProjectRecord, milestone: Milestone): Promise<boolean> {
  if (!milestone.evidence) return false;
  const head = await commitOf(host, record.folder);
  if (head !== milestone.evidence.commit) return true;
  const dirty = await host.exec('git', ['status', '--porcelain'], record.folder);
  const dirtyNow = dirty.stdout.trim().length > 0;
  // Evidence taken on a dirty tree records the diff; a tree that is dirty now
  // but was clean then (or the reverse) has moved.
  return dirtyNow !== (milestone.evidence.diffSummary !== null);
}
