/**
 * What the runtime does FOR the owner: research through the subagent seam,
 * dispatch through the typed Orchestrator and Room handles, and evidence
 * through the workspace command, git and dev-server seams. The owner never
 * touches any of these; it asks, and is woken with the result.
 */

import path from 'node:path';
import { executionMode, projectWriter, roomWorkspace, workflowWorkspace } from './execution-location';
import { setTimeout as delay } from 'node:timers/promises';

import { modelKey, createOrchestratorRoom, getOrchestratorRegistry, requestOrchestratorAction } from '@sero-ai/common';
import type { ObservationOperationKind, OrchestratorBoardCreateOptions, OrchestratorRoomCreateRequest } from '@sero-ai/common';

import { recoverDispatch } from './dispatch-link';
import { chargeRoomPlanning, runProjectModel } from './project-usage';
import { closeDeliveredObjectives } from './objective-completion';
import { runDirectResearch } from './research-direct';
import { resolveProjectContext } from './model-resolution';
import { roomModelLimits } from './model-selection';
import { startResearchRoom } from './research-room';
import { startResearchWorkflow } from './research-workflow';

import { delegationPolicyId, hasAgreement } from '../shared/agreement';
import { bindEvidence, supersededBy } from '../shared/evidence-binding';
import { allocateStart, availableUsd, RESEARCH_START_USD } from '../shared/budget';
import { appendHistory, block, settle } from '../shared/lifecycle';
import type { EvidenceCommand, EvidenceRecord, Milestone, PendingResearch, ProjectRecord } from '../shared/record';
import { MAINTENANCE_MILESTONE_ID, MAINTENANCE_TRIGGERS, maintenancePrompt } from '../shared/maintenance';
import type { WakeEvent } from '../shared/wake';
import type { ArchitectHost } from './host';
import { captureConfirmed, commitOf, diffSummaryOf, evidenceIsStale, remainingUsd, replaceMilestone, worktreeFingerprint } from './service-helpers';
import type { OwnerServices } from './owner-actions';
import type { RecordStore } from './record-store';
import type { RunJournal } from './run-journal';
import type { SpanRecorder } from './spans';
import { activeRun } from '../shared/runs';

export interface ServicesDeps {
  host: ArchitectHost;
  store: RecordStore;
  wake(projectId: string, wake: WakeEvent): void;
  /** Semantic operation spans. Absent leaves execution unchanged. */
  spans?: SpanRecorder;
  /**
   * The run journal, so every charged delta also lands in the trace. Without it
   * a charge still reaches the budget and the trace records no cost at all, so
   * the two cannot be reconciled.
   */
  journal?: RunJournal;
}

const COMMAND_TIMEOUT_MS = 10 * 60_000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);


export function createServices(deps: ServicesDeps): OwnerServices {
  const { host, store } = deps;

  /**
   * Wraps one semantic operation in a span. The runtime says what the operation
   * is; a model never narrates it. Without a recorder this is the plain call, so
   * ordinary callers are unaffected.
   */
  const span = async <T>(
    record: ProjectRecord,
    kind: ObservationOperationKind,
    suffix: string,
    work: () => Promise<T>,
    identity: { parentOperationId?: string; model?: string; thinking?: string } = {},
  ): Promise<T> => {
    const recorder = deps.spans;
    if (!recorder) return work();
    const open = activeRun(record);
    if (!open) return work();
    const operationId = `${open.id}:${kind}:${suffix}`;
    return recorder.around({
      projectId: record.id,
      runId: open.id,
      operationId,
      kind,
      parentOperationId: identity.parentOperationId,
      // The model the runtime used for the call this span covers. Set only where
      // the Architect makes the call itself: a delegated operation names no
      // model, because the delegate chose it and the Architect did not see it.
      model: identity.model,
      thinking: identity.thinking,
    }, work);
  };

  const runPreview = async (
    record: ProjectRecord,
    milestone: Milestone,
    route: string,
    startedAt: number,
  ): Promise<NonNullable<EvidenceRecord['preview']>> => {
    const workspaceId = record.workspaceId;
    if (!workspaceId) return { route, smokePassed: false, capturePath: null, failure: 'The project has no registered workspace.' };
    const command = await host.detectDevServerCommand(record.folder);
    if (!command) {
      const failure = `No dev server command was detected in ${record.folder}. Add a dev script for this app, then request fresh evidence.`;
      host.log(failure);
      return { route, smokePassed: false, capturePath: null, failure };
    }
    const server = await host.startDevServer({ workspaceId, workspacePath: record.folder, cwdPath: record.folder, command, name: `architect ${milestone.id}`, scope: 'workspace' });
    if (!server.url) {
      const failure = `Dev server did not start: ${server.reason ?? 'no URL was returned'}`;
      host.log(failure);
      return { route, smokePassed: false, capturePath: null, failure };
    }
    const url = new URL(route, server.url).toString();
    let smokePassed = false;
    let capturePath: string | null = null;
    let failure: string | undefined;
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      smokePassed = response.status >= 200 && response.status < 300;
      if (!smokePassed) failure = `Preview ${url} returned HTTP ${response.status}.`;
    } catch (error) {
      failure = `Could not reach preview ${url}: ${error instanceof Error ? error.message : String(error)}`;
    }
    if (smokePassed) {
      const evidenceDir = path.join(record.folder, '.sero', 'apps', 'architect', 'evidence', milestone.id);
      const target = path.join(evidenceDir, `${await commitOf(host, record.folder)}.png`);
      const capture = await runProjectModel(deps, record, { kind: 'capture', id: milestone.id }, {
        systemPrompt: 'Verify and capture the requested local project preview. Use the supplied URL and save path. Do not edit project files or perform unrelated actions. A saved image alone is not success: inspect it and reject error pages, blank pages, editor errors, or the wrong app.',
        model: record.session.model ?? undefined,
        thinking: record.session.thinking ?? undefined,
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
      if (capture.error) throw new Error(`Preview capture failed: ${capture.error}`);
      if (!captureConfirmed(capture.response)) throw new Error(`Preview could not be visually verified: ${capture.response.slice(-1500)}`);
      const info = await host.fileInfo(target);
      if (info && info.mtimeMs >= startedAt && info.size > 0 && info.head.equals(PNG_SIGNATURE)) capturePath = target;
      else throw new Error(`Preview capture was not saved at ${target}. ${capture.response.slice(-1500)}`);
    }
    return { route, smokePassed, capturePath, ...(failure ? { failure } : {}) };
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
    const workspaceId = record.workspaceId;
    const ran: EvidenceCommand[] = [];
    await span(record, 'evidence', milestoneId, async () => {
      for (const command of commands) {
        const began = Date.now();
        const result = await host.runCommand(workspaceId, record.folder, command, COMMAND_TIMEOUT_MS);
        ran.push({ command, exitCode: result.exitCode, output: [result.stdout, result.stderr].filter(Boolean).join('\n').slice(-4000), durationMs: Date.now() - began });
      }
    });
    // Keep real command results when the later preview fails. Reporting a
    // capture error as a test exit code sends the owner to repair working code.
    const evidenceSpan = `${activeRun(record)?.id ?? ''}:evidence:${milestoneId}`;
    const preview = route && ran.every((command) => command.exitCode === 0)
      ? await span(record, 'evidence', `${milestoneId}:capture`, () => runPreview(record, milestone, route, startedAt), {
        parentOperationId: evidenceSpan,
        model: record.session.model ?? undefined,
        thinking: record.session.thinking ?? undefined,
      })
        .catch((error: unknown) => ({
          route, smokePassed: false, capturePath: null,
          failure: error instanceof Error ? error.message : String(error),
        })) : null;
    const [diffSummary, fingerprint] = await Promise.all([
      diffSummaryOf(host, record.folder, baseCommit),
      worktreeFingerprint(host, record.folder),
    ]);
    const filesChanged = diffSummary !== null;
    const passed = ran.every((c) => c.exitCode === 0)
      && (preview === null || (preview.smokePassed && preview.capturePath !== null));
    const binding = record.pendingEvidence?.find((pending) => pending.milestoneId === milestoneId)?.binding;
    const evidence: EvidenceRecord = { commit, fingerprint, checkedAt: host.now(), commands: ran, diffSummary, filesChanged, preview, passed, stale: false, ...(binding ? { binding } : {}) };
    let superseded: string[] = [];
    await store.update(projectId, (fresh) => {
      const current = fresh.milestones.find((m) => m.id === milestoneId) ?? milestone;
      // A criterion or the preview target changed while the check ran: the
      // result is kept as history and verifies nothing current.
      superseded = supersededBy(fresh, current, binding);
      const stands = passed && superseded.length === 0;
      const verified: Milestone = {
        ...current,
        status: current.status === 'done' && stands ? 'done' : 'verifying',
        evidence,
        verification: stands ? (current.status === 'done' ? current.verification : 'verified') : 'reported',
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
    const previewNote = preview ? (preview.smokePassed ? (preview.capturePath ? 'preview captured' : 'preview rendered but no capture was produced') : `preview smoke check failed${preview.failure ? `: ${preview.failure}` : ''}`) : '';
    deps.wake(projectId, {
      kind: 'dispatch-complete',
      at: host.now(),
      items: [`evidence for milestone ${milestoneId} ${passed ? 'passed' : 'failed'} at commit ${commit}${failures.length ? `: ${failures.join(', ')}` : ''}${previewNote ? ` (${previewNote})` : ''}${superseded.length ? `. It does not verify the current work: ${superseded.join('; ')}. Run evidence again for the current criteria` : ''}`],
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
    if (pending.kind === 'workflow') {
      void startResearchWorkflow(deps, record, pending).catch((error: unknown) => host.log(`Research Workflow recovery failed: ${String(error)}`));
      return;
    }
    if (pending.kind === 'room') {
      void startResearchRoom(deps, record, pending).catch((error: unknown) => host.log(`Discovery Room recovery failed: ${String(error)}`));
      return;
    }
    void runDirectResearch(deps, span, record, pending).catch((error: unknown) => host.log(`Research ${pending.id} failed: ${String(error)}`));
  };

  const services: OwnerServices = {
    async resolveDispatchProject(record) {
      const resolved = await resolveProjectContext(host, record);
      if (!resolved.ok) throw new Error(resolved.error);
      return resolved.value;
    },

    async research(record, request) {
      const existing = record.pendingResearch?.find((entry) => entry.question === request.question && entry.stoppingCondition === request.stoppingCondition && entry.kind === request.kind && entry.openSpecChange === request.openSpecChange && (entry.access ?? 'read-only') === (request.access ?? 'read-only'));
      if (existing) return { id: existing.id };
      executionMode(record);
      const pending: PendingResearch = { id: host.newId('res'), ...request, startedAt: host.now(), project: await services.resolveDispatchProject(record) };
      // A Room or Workflow carries a spending limit, so its start is promised
      // that much. One direct researcher has no limit the host can enforce, so
      // nothing is promised for it: it starts only while some budget is free.
      let refusal = '';
      const written = await store.update(record.id, (fresh) => {
        const allocation = allocateStart(fresh, RESEARCH_START_USD);
        if (!allocation.ok) {
          refusal = allocation.error;
          return null;
        }
        const entry = pending.kind && allocation.allocatedUsd !== undefined ? { ...pending, allocatedUsd: allocation.allocatedUsd } : pending;
        return settle({ ...fresh, pendingResearch: [...(fresh.pendingResearch ?? []), entry] }, host.now());
      });
      if (!written) throw new Error(refusal || `No project ${record.id}.`);
      runResearch(written, written.pendingResearch?.find((entry) => entry.id === pending.id) ?? pending);
      return { id: pending.id };
    },

    async dispatch(record, milestone, request) {
      if (!record.workspaceId) throw new Error('The project has no workspace to dispatch into.');
      // Captured after the guard: a narrowing does not survive into a closure.
      // A distinct name, because the workflow branch below declares its own.
      const projectWorkspaceId = record.workspaceId;
      const baseCommit = await commitOf(host, record.folder);
      const remaining = remainingUsd(record);
      if (remaining === 0) throw new Error('The project has no budget remaining.');
      // The reservation sized this start against what was free. A dispatch that
      // carries none is measured against what the project has left.
      const allocated = milestone.pendingDispatch?.allocatedUsd;
      const maxCostUsd = allocated ?? (request.maxCostUsd === null ? remaining : remaining === undefined ? request.maxCostUsd : Math.min(request.maxCostUsd, remaining));
      const limits = maxCostUsd === undefined ? {} : { maxCostUsd };
      if (request.kind === 'workflow') {
        // Workspace runtimes start concurrently with the global Architect runtime.
        const deadline = Date.now() + 5000;
        while (milestone.pendingDispatch?.request && !getOrchestratorRegistry()?.has(record.workspaceId) && Date.now() < deadline) {
          await delay(100);
        }
        const createOptions: OrchestratorBoardCreateOptions = {
          requestId: milestone.pendingDispatch?.request?.id,
          activate: false,
          disableTokenLimit: true,
          // A milestone is work the project asked for once. Saying so here stops
          // the Orchestrator making a model call to ask whether it recurs.
          triggerIntent: 'one-off',
          triggers: [],
          limits,
          workspace: workflowWorkspace(record),
          delivery: { destination: request.destination ?? 'workspace-files' },
        };
        if (request.project) createOptions.project = request.project;
        // The span covers the Orchestrator's own planning and creation call, so
        // the timeline shows where the project's time went before any worker ran.
        const result = await span(record, 'workflow', `${milestone.id}:plan`, () => requestOrchestratorAction(projectWorkspaceId, {
          kind: 'create',
          prompt: request.prompt,
          title: milestone.title,
          options: createOptions,
        }));
        if (!result.ok || !result.loopId) throw new Error(result.error ?? 'The Workflow was not created.');
        const loopId = result.loopId;
        const workspaceId = record.workspaceId;
        return { id: loopId, workspaceId, baseCommit, async start() {
          const activated = await requestOrchestratorAction(workspaceId, { kind: 'activate', loopId });
          if (!activated.ok) throw new Error(activated.error ?? 'The Workflow could not start.');
        } };
      }
      await chargeRoomPlanning(deps, record.id, { kind: 'dispatch', id: milestone.id });
      const roomRequest: OrchestratorRoomCreateRequest = {
        requestId: milestone.pendingDispatch?.request?.id,
        mandate: request.prompt,
        limits: { ...limits, ...await roomModelLimits(host, request.project?.modelSnapshot), ...roomWorkspace(record), access: 'edit-workspace', deliveryDestination: request.destination ?? 'workspace-files' },
      };
      if (request.project) roomRequest.project = request.project;
      // The host skips a repeat approval for a Room inside the approved start.
      const policyId = delegationPolicyId(record);
      if (policyId) roomRequest.delegationPolicyId = policyId;
      // A Room's planning is its own operation, before any member starts.
      const result = await span(record, 'planning', `${milestone.id}:room-plan`, () => createOrchestratorRoom(projectWorkspaceId, roomRequest));
      const chargedUsd = await chargeRoomPlanning(deps, record.id, { kind: 'dispatch', id: milestone.id }, result.usage);
      if (!result.ok) throw new Error(result.error);
      return { id: result.roomId, workspaceId: record.workspaceId, baseCommit, chargedUsd };
    },

    async maintenance(record) {
      if (!record.workspaceId) throw new Error('The project has no workspace.');
      if (record.phase !== 'maintain' || record.paused || record.blockedReason !== null || record.overlay === 'limited') {
        throw new Error(`Maintenance cannot start while the project is ${record.overlay ?? record.phase}.`);
      }
      if (record.milestones.some((m) => m.id === MAINTENANCE_MILESTONE_ID)) return record;
      const remaining = availableUsd(record) ?? undefined;
      if (remaining === 0) throw new Error('Maintenance cannot start with no budget remaining.');
      const workspace = workflowWorkspace(record);
      const project = record.maintenanceProject ?? await services.resolveDispatchProject(record);
      await store.update(record.id, (fresh) => ({ ...fresh, preparingMaintenance: true, maintenanceProject: project, stateLine: 'Preparing the maintenance Workflow.' }));
      try {
        const result = await requestOrchestratorAction(record.workspaceId, {
          kind: 'create',
          prompt: maintenancePrompt(record),
          title: `${record.name}: maintenance`,
          options: { project, requestId: `${record.id}:maintenance`, activate: false, delivery: { destination: 'workspace-files' }, workspace, disableTokenLimit: true, limits: remaining === undefined ? {} : { maxCostUsd: remaining }, triggers: [...MAINTENANCE_TRIGGERS], triggerIntent: 'supplied' },
        }).catch((error: unknown) => ({ ok: false as const, error: String(error), loopId: undefined }));
        if (!result.ok || !result.loopId) {
          await store.update(record.id, (fresh) => ({ ...fresh, stateLine: result.error ?? 'The maintenance Workflow was not created.' }));
          throw new Error(result.error ?? 'The maintenance Workflow was not created.');
        }
        const now = host.now();
        const loopId = result.loopId;
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
          return appendHistory(
            { ...fresh, stateLine: 'Maintenance Workflow is ready.', milestones: [...fresh.milestones, milestone] },
            now,
            'Maintenance Workflow subscribed',
            { kind: 'workflow', id: loopId, label: milestone.title },
          );
        });
        // Activation can await the first run. Save the link and release the
        // owner now so directives are not held behind a maintenance execution.
        void requestOrchestratorAction(record.workspaceId, { kind: 'activate', loopId: result.loopId })
          .then((started) => { if (!started.ok) throw new Error(started.error ?? 'Maintenance could not start.'); })
          .catch(async (error: unknown) => {
            const reason = `Maintenance activation failed: ${String(error)}`;
            await store.update(record.id, (fresh) => {
              const held = block(fresh, host.now(), reason);
              return held.ok ? { ...held.record, stateLine: reason } : fresh;
            });
          });
        return next ?? record;
      } finally {
        await store.update(record.id, (fresh) => fresh.preparingMaintenance ? { ...fresh, preparingMaintenance: false } : null);
      }
    },

    restartResearch(record, researchId) {
      const pending = record.pendingResearch?.find((entry) => entry.id === researchId);
      if (pending) runResearch(record, pending);
    },

    recoverPending(record) {
      void recoverDispatch(store, services, record).catch(async (error: unknown) => {
        const reason = `Could not start workflow recovery: ${error instanceof Error ? error.message : String(error)}`;
        await store.update(record.id, (fresh) => {
          const held = block(fresh, host.now(), reason);
          return held.ok ? { ...held.record, stateLine: reason } : null;
        });
      }).catch((error: unknown) => host.log(`Could not record dispatch recovery failure: ${String(error)}`));
      for (const pending of record.pendingResearch ?? []) runResearch(record, pending);
      for (const pending of record.pendingEvidence ?? []) {
        startEvidence(record.id, pending.milestoneId, pending.commands, pending.route, Date.parse(pending.startedAt));
      }
    },

    evidenceIsStale: (record, milestone) => evidenceIsStale(host, record, milestone),
    startFailed: (projectId, item) => deps.wake(projectId, { kind: 'dispatch-blocked', at: host.now(), items: [item] }),

    async evidence(record, milestone, request) {
      const startedAt = Date.now();
      // Mark the operation durably before it starts so restart can recover it.
      const reserved = await store.update(record.id, (fresh) => {
        const current = fresh.milestones.find((m) => m.id === milestone.id);
        if (!current || activeEvidence.has(`${record.id}:${milestone.id}`)
          || (fresh.pendingEvidence ?? []).some((pending) => pending.milestoneId === milestone.id)) return null;
        const writer = projectWriter(fresh);
        if (writer) throw new Error(`The project folder is in use by ${writer.id}. Wait for its result before verification.`);
        const marked: Milestone = { ...current, status: current.status === 'done' ? 'done' : 'verifying', preview: request.route ? { route: request.route } : current.preview };
        // What the check covers is fixed now, on the record as it stands. A
        // result that lands after a criterion changed still names the old one.
        const binding = hasAgreement(fresh) ? bindEvidence(fresh, marked, request.criteria ?? [], request.route) : null;
        if (typeof binding === 'string') throw new Error(binding);
        const pendingEvidence = [
          ...(fresh.pendingEvidence ?? []).filter((pending) => pending.milestoneId !== milestone.id),
          { milestoneId: milestone.id, commands: request.commands, route: request.route, startedAt: new Date(startedAt).toISOString(), ...(binding ? { binding } : {}) },
        ];
        return settle({ ...replaceMilestone(fresh, marked), pendingEvidence, stateLine: `Checking ${current.title}.` }, host.now());
      });

      if (reserved) startEvidence(record.id, milestone.id, request.commands, request.route, startedAt);
    },
  };
  return services;
}
