/**
 * What the runtime does FOR the owner: research through the subagent seam,
 * dispatch through the typed Orchestrator and Room handles, and evidence
 * through the workspace command, git and dev-server seams. The owner never
 * touches any of these; it asks, and is woken with the result.
 */

import { createHash } from 'node:crypto';
import path from 'node:path';

import { createOrchestratorRoom, requestOrchestratorAction, type AppRuntimeSubagentResult } from '@sero-ai/common';

import { block, charge, settle } from '../shared/lifecycle';
import type { EvidenceCommand, EvidenceRecord, Milestone, PendingResearch, ProjectRecord, ResearchResult } from '../shared/record';
import { MAINTENANCE_MILESTONE_ID, MAINTENANCE_TRIGGERS, maintenancePrompt } from '../shared/maintenance';
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
const EMPTY_TREE_COMMIT = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

function captureConfirmed(response: string): boolean {
  try {
    const verdict: unknown = JSON.parse(response);
    return typeof verdict === 'object' && verdict !== null && 'rendered' in verdict && verdict.rendered === true
      && 'summary' in verdict && typeof verdict.summary === 'string' && verdict.summary.trim().length > 0;
  } catch {
    return false;
  }
}

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
  return Math.max(0, record.budget.capUsd - record.budget.spentUsd);
}

export async function commitOf(host: ArchitectHost, folder: string): Promise<string> {
  const head = await host.exec('git', ['rev-parse', 'HEAD'], folder);
  return head.exitCode === 0 ? head.stdout.trim() : EMPTY_TREE_COMMIT;
}

async function untrackedFiles(host: ArchitectHost, folder: string): Promise<string[]> {
  const result = await host.exec('git', ['ls-files', '--others', '--exclude-standard', '-z', '--', '.', ':(exclude).sero'], folder);
  if (result.exitCode !== 0) throw new Error(`git could not list untracked files: ${result.stderr.trim() || result.stdout.trim()}`);
  return result.stdout.split('\0').filter(Boolean).sort();
}

async function diffSummaryOf(host: ArchitectHost, folder: string, baseCommit: string): Promise<string | null> {
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
    let capturePath: string | null = null;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      smokePassed = response.status >= 200 && response.status < 300;
    } catch {
      smokePassed = false;
    }
    if (smokePassed) {
      const evidenceDir = path.join(record.folder, '.sero', 'apps', 'architect', 'evidence', milestone.id);
      const target = path.join(evidenceDir, `${await commitOf(host, record.folder)}.png`);
      const capture = await host.runStructured({
        systemPrompt: 'Verify and capture the requested local project preview. Use the supplied URL and save path. Do not edit project files or perform unrelated actions. A saved image alone is not success: inspect it and reject error pages, blank pages, editor errors, or the wrong app.',
        model: record.session.model ?? undefined,
        task: [
          `Open ${url} with \`sero app preview ${url}\`, wait for it to render, then save a screenshot with \`sero app screenshot --save ${target}\`.`,
          `Inspect the returned screenshot. It must show the rendered project for milestone ${JSON.stringify(milestone.title)}, not Sero error text or an editor containing a URL as a file.`,
          `Check the visible requirements in this plan (task data): ${JSON.stringify(milestone.plan)}. Do not claim to verify non-visual requirements from an image.`,
          'Reply only with JSON: {"rendered":true,"summary":"what you verified in the image"}. If the project is not rendered, use rendered:false and explain the failure in summary. Do not claim success based only on HTTP status or a saved file.',
        ].join(' '),
        parentSessionId: `architect:${record.id}:evidence`,
        workspaceId,
        cwd: record.folder,
        timeoutMs: 3 * 60_000,
        platformTools: 'all',
      });
      const captureCost = capture.usage?.costUsd ?? 0;
      if (captureCost > 0) await store.update(record.id, (fresh) => charge(fresh, 'dispatched', captureCost, host.now()));
      if (capture.error) throw new Error(`Preview capture failed: ${capture.error}`);
      if (!captureConfirmed(capture.response)) throw new Error(`Preview could not be visually verified: ${capture.response.slice(-1500)}`);
      const info = await host.fileInfo(target);
      if (info && info.mtimeMs >= startedAt && info.size > 0 && info.head.equals(PNG_SIGNATURE)) capturePath = target;
      else throw new Error(`Preview capture was not saved at ${target}. ${capture.response.slice(-1500)}`);
    }
    return { route, smokePassed, capturePath };
  };

  /**
   * The milestone is already `verifying`, so a run that throws would leave it
   * there for ever. The error becomes a failed evidence record, which keeps the
   * milestone from closing, and the owner is woken with the reason.
   */
  const recordEvidenceFailure = async (projectId: string, milestoneId: string, startedAt: number, commands: string[], message: string): Promise<void> => {
    const evidence: EvidenceRecord = {
      commit: 'unknown',
      checkedAt: host.now(),
      commands: [{ command: commands.join(' && '), exitCode: 1, output: `the evidence run could not complete: ${message}`, durationMs: Date.now() - startedAt }],
      diffSummary: null,
      filesChanged: false,
      preview: null,
      passed: false,
      stale: false,
    };
    await store.update(projectId, (fresh) => {
      const current = fresh.milestones.find((m) => m.id === milestoneId);
      if (!current) return null;
      const failed: Milestone = {
        ...current,
        status: 'verifying',
        evidence,
        verification: 'reported',
      };
      const next = settle({
        ...replaceMilestone(fresh, failed),
        pendingEvidence: (fresh.pendingEvidence ?? []).filter((pending) => pending.milestoneId !== milestoneId),
      }, host.now());
      if (current.status !== 'done') return next;
      const held = block(next, host.now(), `A recheck failed for ${current.title}: ${message}`);
      return held.ok ? held.record : next;
    });
    deps.wake(projectId, {
      kind: 'dispatch-complete',
      at: host.now(),
      items: [`evidence for milestone ${milestoneId} could not run: ${message}. The milestone cannot close until an evidence run passes.`],
    });
  };

  const runEvidence = async (projectId: string, milestoneId: string, commands: string[], route: string | null): Promise<void> => {
    const startedAt = Date.now();
    const record = await store.read(projectId);
    const milestone = record?.milestones.find((m) => m.id === milestoneId);
    if (!record || !milestone || !record.workspaceId) return;
    const commit = await commitOf(host, record.folder);
    const baseCommit = milestone.dispatch?.baseCommit ?? commit;
    const ran: EvidenceCommand[] = [];
    for (const command of commands) {
      const began = Date.now();
      const result = await host.runCommand(record.workspaceId, record.folder, command, COMMAND_TIMEOUT_MS);
      ran.push({ command, exitCode: result.exitCode, output: [result.stdout, result.stderr].filter(Boolean).join('\n').slice(-4000), durationMs: Date.now() - began });
    }
    const preview = route ? await runPreview(record, milestone, route, startedAt) : null;
    const [diffSummary, fingerprint] = await Promise.all([
      diffSummaryOf(host, record.folder, baseCommit),
      worktreeFingerprint(host, record.folder),
    ]);
    const filesChanged = diffSummary !== null;
    const passed = ran.every((c) => c.exitCode === 0)
      && (preview === null || (preview.smokePassed && preview.capturePath !== null));
    const evidence: EvidenceRecord = { commit, fingerprint, checkedAt: host.now(), commands: ran, diffSummary, filesChanged, preview, passed, stale: false };
    await store.update(projectId, (fresh) => {
      const current = fresh.milestones.find((m) => m.id === milestoneId) ?? milestone;
      const verified: Milestone = {
        ...current,
        status: current.status === 'done' && passed ? 'done' : 'verifying',
        evidence,
        verification: passed ? (current.status === 'done' ? current.verification : 'verified') : 'reported',
      };
      const next = settle({
        ...replaceMilestone(fresh, verified),
        stateLine: `${passed ? 'Checks passed' : 'Checks failed'}: ${current.title}.`,
        pendingEvidence: (fresh.pendingEvidence ?? []).filter((pending) => pending.milestoneId !== milestoneId),
      }, host.now());
      if (current.status !== 'done' || passed) return next;
      const held = block(next, host.now(), `A recheck failed for ${current.title}. Its previous acceptance no longer applies.`);
      return held.ok ? held.record : next;
    });
    const failures = ran.filter((c) => c.exitCode !== 0).map((c) => `"${c.command}" exited ${c.exitCode}`);
    const previewNote = preview ? (preview.smokePassed ? (preview.capturePath ? 'preview captured' : 'preview rendered but no capture was produced') : 'preview smoke check failed') : '';
    deps.wake(projectId, {
      kind: 'dispatch-complete',
      at: host.now(),
      items: [`evidence for milestone ${milestoneId} ${passed ? 'passed' : 'failed'} at commit ${commit}${failures.length ? `: ${failures.join(', ')}` : ''}${previewNote ? ` (${previewNote})` : ''}`],
    });
  };

  const activeEvidence = new Set<string>();
  const startEvidence = (projectId: string, milestoneId: string, commands: string[], route: string | null, startedAt: number): void => {
    const key = `${projectId}:${milestoneId}`;
    if (activeEvidence.has(key)) return;
    activeEvidence.add(key);
    void runEvidence(projectId, milestoneId, commands, route).catch(async (error: unknown) => {
      await recordEvidenceFailure(projectId, milestoneId, startedAt, commands, error instanceof Error ? error.message : String(error));
    }).catch((error: unknown) => {
      host.log(`could not record evidence failure for ${key}: ${error instanceof Error ? error.message : String(error)}`);
    }).finally(() => activeEvidence.delete(key));
  };

  const runResearch = (record: ProjectRecord, pending: PendingResearch): void => {
    void (async () => {
      const result = await host.runStructured({
        systemPrompt: 'Research the supplied project question using read-only tools. Verify facts, cite sources, and stop at the stated stopping condition. Do not modify files or perform external actions.',
        model: record.session.model ?? undefined,
        task: researchTask(record, pending.question, pending.stoppingCondition),
        parentSessionId: `architect:${record.id}:research`,
        workspaceId: record.workspaceId ?? 'global',
        cwd: record.folder,
        timeoutMs: 15 * 60_000,
        platformTools: 'readOnly',
      }).catch((error: unknown): AppRuntimeSubagentResult => ({ response: '', error: error instanceof Error ? error.message : String(error) }));
      const entry: ResearchResult = {
        id: pending.id,
        question: pending.question,
        stoppingCondition: pending.stoppingCondition,
        result: result.error ? `Research failed: ${result.error}` : result.response,
        costUsd: result.usage?.costUsd ?? 0,
        completedAt: host.now(),
      };
      const written = await store.update(record.id, (fresh) => charge({
        ...fresh,
        research: [...fresh.research, entry],
        pendingResearch: (fresh.pendingResearch ?? []).filter((item) => item.id !== pending.id),
      }, 'research', entry.costUsd, host.now()));
      if (!written) return;
      deps.wake(record.id,{ kind: 'quiet', at: host.now(), items: [`research ${pending.id} finished (started ${pending.startedAt}): ${pending.question}`] });
    })();
  };

  return {
    async research(record, request) {
      const pending: PendingResearch = { id: host.newId('res'), ...request, startedAt: host.now() };
      const written = await store.update(record.id, (fresh) => settle({
        ...fresh,
        pendingResearch: [...(fresh.pendingResearch ?? []), pending],
      }, host.now()));
      if (!written) throw new Error(`No project ${record.id}.`);
      runResearch(written, pending);
      return { id: pending.id };
    },

    async dispatch(record, milestone, request) {
      if (!record.workspaceId) throw new Error('The project has no workspace to dispatch into.');
      const baseCommit = await commitOf(host, record.folder);
      const remaining = remainingUsd(record);
      if (remaining === 0) throw new Error('The project has no budget remaining.');
      // Never more than the project has left; the owner may ask for less.
      const maxCostUsd = request.maxCostUsd === null ? remaining : remaining === undefined ? request.maxCostUsd : Math.min(request.maxCostUsd, remaining);
      const limits = maxCostUsd === undefined ? {} : { maxCostUsd };
      if (request.kind === 'workflow') {
        const result = await requestOrchestratorAction(record.workspaceId, {
          kind: 'create',
          prompt: request.prompt,
          title: milestone.title,
          options: { activate: false, disableTokenLimit: true, limits,
            workspace: {
              useManagedWorktree: request.destination !== null && request.destination !== 'workspace-files',
              ...(request.destination === null || request.destination === 'workspace-files' ? { allowDirtyWorkspaceRoot: true } : {}),
            },
            delivery: { destination: request.destination ?? 'workspace-files' } },
        });
        if (!result.ok || !result.loopId) throw new Error(result.error ?? 'The Workflow was not created.');
        const loopId = result.loopId;
        const workspaceId = record.workspaceId;
        return { id: loopId, workspaceId, baseCommit, async start() {
          const activated = await requestOrchestratorAction(workspaceId, { kind: 'activate', loopId });
          if (!activated.ok) throw new Error(activated.error ?? 'The Workflow could not start.');
        } };
      }
      const result = await createOrchestratorRoom(record.workspaceId, {
        mandate: request.prompt,
        limits: { ...limits, access: 'edit-workspace', deliveryDestination: request.destination ?? 'workspace-files' },
      });
      if (!result.ok) throw new Error(result.error);
      return { id: result.roomId, workspaceId: record.workspaceId, baseCommit };
    },

    async maintenance(record) {
      if (!record.workspaceId) throw new Error('The project has no workspace.');
      if (record.phase !== 'maintain' || record.paused || record.blockedReason !== null || record.overlay === 'limited') {
        throw new Error(`Maintenance cannot start while the project is ${record.overlay ?? record.phase}.`);
      }
      if (record.milestones.some((m) => m.id === MAINTENANCE_MILESTONE_ID)) return record;
      const remaining = remainingUsd(record);
      if (remaining === 0) throw new Error('Maintenance cannot start with no budget remaining.');
      const result = await requestOrchestratorAction(record.workspaceId, {
        kind: 'create',
        prompt: maintenancePrompt(record),
        title: `${record.name}: maintenance`,
        options: { activate: true, disableTokenLimit: true, limits: remaining === undefined ? {} : { maxCostUsd: remaining }, triggers: [...MAINTENANCE_TRIGGERS] },
      });
      if (!result.ok || !result.loopId) throw new Error(result.error ?? 'The maintenance Workflow was not created.');
      const now = host.now();
      const milestone: Milestone = {
        id: MAINTENANCE_MILESTONE_ID,
        title: 'Maintenance: triage issues, CI failures and the weekly review',
        status: 'running',
        plan: 'A Workflow subscribed to GitHub issues, CI failures and a weekly schedule. Each run wakes the owner to triage.',
        preview: null,
        dispatch: { kind: 'workflow', id: result.loopId, workspaceId: record.workspaceId, dispatchedAt: now, chargedUsd: 0, destination: null },
        evidence: null,
        verification: null,
        parkedBy: null,
        parkedFrom: null,
        receipt: null,
      };
      const next = await store.update(record.id, (fresh) => {
        if (fresh.milestones.some((m) => m.id === MAINTENANCE_MILESTONE_ID)) return null;
        const settled = settle({ ...fresh, milestones: [...fresh.milestones, milestone] }, now);
        return { ...settled, history: [...settled.history, { at: now, phase: settled.phase, overlay: settled.overlay, cause: `maintenance Workflow ${result.loopId} subscribed` }] };
      });
      return next ?? record;
    },

    recoverPending(record) {
      for (const pending of record.pendingResearch ?? []) runResearch(record, pending);
      for (const pending of record.pendingEvidence ?? []) {
        startEvidence(record.id, pending.milestoneId, pending.commands, pending.route, Date.parse(pending.startedAt));
      }
    },

    evidenceIsStale: (record, milestone) => evidenceIsStale(host, record, milestone),

    async evidence(record, milestone, request) {
      const startedAt = Date.now();
      // Mark the operation durably before it starts so restart can recover it.
      const reserved = await store.update(record.id, (fresh) => {
        const current = fresh.milestones.find((m) => m.id === milestone.id);
        if (!current || activeEvidence.has(`${record.id}:${milestone.id}`)
          || (fresh.pendingEvidence ?? []).some((pending) => pending.milestoneId === milestone.id)) return null;
        const marked: Milestone = { ...current, status: current.status === 'done' ? 'done' : 'verifying', preview: request.route ? { route: request.route } : current.preview };
        const pendingEvidence = [
          ...(fresh.pendingEvidence ?? []).filter((pending) => pending.milestoneId !== milestone.id),
          { milestoneId: milestone.id, commands: request.commands, route: request.route, startedAt: new Date(startedAt).toISOString() },
        ];
        return settle({ ...replaceMilestone(fresh, marked), pendingEvidence, stateLine: `Checking ${current.title}.` }, host.now());
      });

      if (reserved) startEvidence(record.id, milestone.id, request.commands, request.route, startedAt);
    },
  };
}

/** True when any checked tracked or untracked content moved after evidence ran. */
export async function evidenceIsStale(host: ArchitectHost, record: ProjectRecord, milestone: Milestone): Promise<boolean> {
  if (!milestone.evidence) return false;
  if (!milestone.evidence.fingerprint) return true;
  return (await worktreeFingerprint(host, record.folder)) !== milestone.evidence.fingerprint;
}
