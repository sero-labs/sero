/**
 * The owner session: one host-managed persistent session per project, opened
 * from a user-approved grant that names only the platform tools and the
 * `sero-cli` bridge. Every turn starts with the contract built from the
 * record, and the contract is sent again when the session compacts mid-turn.
 */

import { modelKey, type PersistentSessionGrantProposal, type PersistentSessionRequest, type PersistentSessionSubjectPolicy, type PersistentSessionsApi } from '@sero-ai/common';

import { block, charge } from '../shared/lifecycle';
import { buildOwnerContract } from '../shared/owner-contract';
import { buildOwnerPromptAdditions } from '../shared/owner-protocol';
import type { ProjectRecord } from '../shared/record';
import type { WakeEvent } from '../shared/wake';
import type { ArchitectHost } from './host';
import type { RecordStore } from './record-store';
import { applyTurnOutcome, type OutcomeKind, type TurnOutcomes } from './turn-outcomes';

/** The platform tools plus the bridge. Nothing else is reachable from a managed session. */
export const OWNER_TOOLS = ['read', 'bash', 'write', 'edit', 'sero-cli'] as const;

const PROMPT_ADDITION_HEADROOM_BYTES = 512;
export const OWNER_SUBJECT = 'owner';

export interface OwnerModelChoice {
  model: string;
  thinking: string;
}

/**
 * The owner's model: `SERO_ARCHITECT_MODEL` (provider/model) when set, else
 * the first reasoning model the machine offers, else the first model at all.
 */
export async function chooseOwnerModel(host: Pick<ArchitectHost, 'listModels' | 'env' | 'log'>): Promise<OwnerModelChoice> {
  const groups = await host.listModels();
  const all = groups.flatMap((group) => group.models.map((model) => ({ key: modelKey(model.provider, model.modelId), model })));
  const wanted = host.env.SERO_ARCHITECT_MODEL?.trim();
  const picked = (wanted ? all.find((entry) => entry.key === wanted) : undefined)
    ?? all.find((entry) => entry.model.reasoning)
    ?? all[0];
  if (!picked) throw new Error('No model is available for the owner session: configure a provider first.');
  if (wanted && picked.key !== wanted) host.log(`SERO_ARCHITECT_MODEL=${wanted} is not available; using ${picked.key}`);
  const thinking = picked.model.reasoning ? (picked.model.availableThinkingLevels?.includes('medium') ? 'medium' : picked.model.availableThinkingLevels?.[0] ?? 'medium') : 'off';
  return { model: picked.key, thinking };
}

export function ownerSubjectPolicy(record: ProjectRecord, choice: OwnerModelChoice): PersistentSessionSubjectPolicy {
  const additions = buildOwnerPromptAdditions(record);
  const size = additions.reduce((total, block) => total + Buffer.byteLength(block, 'utf8'), 0);
  return {
    allowedCwds: [record.folder],
    allowedModels: [choice.model],
    allowedThinkingLevels: [choice.thinking],
    allowedTools: [...OWNER_TOOLS],
    allowedSkills: [],
    // The owner edits the project's own files and commits them; it never pushes.
    // Publishing is a release step with its own user decision.
    permissionProfile: { filesystem: 'write', commands: 'all', network: 'fetch', vcs: 'commit' },
    maxSystemPromptAdditionBytes: size + PROMPT_ADDITION_HEADROOM_BYTES,
  };
}

export function ownerGrantProposal(record: ProjectRecord, choice: OwnerModelChoice): PersistentSessionGrantProposal {
  if (!record.workspaceId) throw new Error(`project ${record.id} has no workspace yet`);
  return {
    owner: `architect:${record.id}`,
    scope: 'project-owner',
    workspaceId: record.workspaceId,
    subjects: { [OWNER_SUBJECT]: ownerSubjectPolicy(record, choice) },
    maxLiveSessions: 1,
    maxTotalSessions: 1,
    reason: `Run the owner agent for the Architect project "${record.name}" in ${record.folder}.`,
  };
}

/** Deterministic: with the session directory it is the Usage plugin's grouping input. */
export function ownerSessionName(record: ProjectRecord): string {
  return `Architect ${record.name} — owner`;
}

export function ownerSessionRequest(record: ProjectRecord, operation: PersistentSessionRequest['operation']): PersistentSessionRequest {
  const { grantId, model, thinking, grantedTools } = record.session;
  if (!grantId || !model || !thinking) throw new Error(`project ${record.id} has no approved owner grant`);
  return {
    grantId,
    subject: OWNER_SUBJECT,
    operation,
    cwd: record.folder,
    model,
    thinking,
    tools: grantedTools ?? [...OWNER_TOOLS],
    skills: [],
    systemPromptAdditions: buildOwnerPromptAdditions(record),
    sessionName: ownerSessionName(record),
  };
}

export interface OwnerSessionDeps {
  host: ArchitectHost;
  store: RecordStore;
  outcomes: TurnOutcomes;
}

export interface OwnerTurnResult {
  record: ProjectRecord;
  status: 'completed' | 'aborted' | 'error';
  declared: OutcomeKind | null;
}

export class OwnerSessions {
  private readonly live = new Map<string, string>();
  /**
   * The turn each project is waiting on. Disposing the session removes the
   * host's watchers, so `turn_end` never arrives; the waiter is ended here
   * instead, or the wake scheduler stays busy for ever.
   */
  private readonly waiting = new Map<string, (status: OwnerTurnResult['status']) => void>();

  constructor(private readonly deps: OwnerSessionDeps) {}

  private api(): PersistentSessionsApi {
    const api = this.deps.host.persistentSessions;
    if (!api) throw new Error('The Architect needs the appRuntime.persistentSessions capability, which this host did not provide.');
    return api;
  }

  /**
   * Proposes the owner grant. A refusal blocks the project with the reason,
   * so the user sees why nothing starts and can retry from the project page.
   */
  async requestGrant(record: ProjectRecord): Promise<ProjectRecord> {
    const now = this.deps.host.now();
    // Asking the user is slow, so the answer is written afterwards, on the
    // record as it stands then.
    let granted: { grantId: string; tools: string[]; choice: OwnerModelChoice } | null = null;
    let refusal = '';
    try {
      const choice = await chooseOwnerModel(this.deps.host);
      const handle = await this.api().requestGrant(ownerGrantProposal(record, choice));
      const subject = handle.subjects[OWNER_SUBJECT];
      granted = { grantId: handle.grantId, tools: subject ? [...subject.allowedTools] : [...OWNER_TOOLS], choice };
    } catch (error) {
      refusal = error instanceof Error ? error.message : String(error);
    }
    const next = await this.deps.store.update(record.id, (fresh) => {
      if (!granted) {
        const blocked = block(fresh, now, `Permission to run the Architect was not approved: ${refusal}`);
        return blocked.ok ? { ...blocked.record, stateLine: 'Permission was not approved. Request permission to try again.' } : fresh;
      }
      return {
        ...fresh,
        session: { ...fresh.session, grantId: granted.grantId, grantedTools: granted.tools, model: granted.choice.model, thinking: granted.choice.thinking },
        history: [...fresh.history, { at: now, phase: fresh.phase, overlay: fresh.overlay, cause: 'the user approved the owner session grant' }],
      };
    });
    return next ?? record;
  }

  /** Opens the owner session (create on first use, open after that) and records where it lives. */
  async ensureOpen(record: ProjectRecord): Promise<{ handleId: string; record: ProjectRecord }> {
    const existing = this.live.get(record.id);
    if (existing) return { handleId: existing, record };
    const api = this.api();
    const handle = record.session.sessionId
      ? await api.open(ownerSessionRequest(record, 'open'))
      : await api.create(ownerSessionRequest(record, 'create'));
    this.live.set(record.id, handle.handleId);
    const next = await this.deps.store.update(record.id, (fresh) => ({
      ...fresh,
      session: { ...fresh.session, sessionId: handle.sessionId, sessionPath: handle.sessionPath },
    }));
    return { handleId: handle.handleId, record: next ?? record };
  }

  /**
   * One wake: contract first, then the turn, then the bookkeeping. The record
   * is re-read after the turn because the owner's actions wrote to it.
   */
  async runTurn(record: ProjectRecord, wake: WakeEvent): Promise<OwnerTurnResult> {
    const api = this.api();
    const { handleId, record: opened } = await this.ensureOpen(record);
    const contract = buildOwnerContract(opened, wake);
    this.deps.outcomes.begin(opened.id);

    let resolveEnd: (status: OwnerTurnResult['status']) => void = () => undefined;
    const ended = new Map<string, OwnerTurnResult['status']>();
    let watching: string | null = null;
    const unsubscribe = api.subscribe(handleId, (event) => {
      if (event.type === 'compacted') {
        // The contract must survive compaction; steering re-asserts it mid-turn.
        void api.steer(handleId, contract).catch((error: unknown) => {
          this.deps.host.log(`could not re-send the contract after compaction: ${error instanceof Error ? error.message : String(error)}`);
        });
        return;
      }
      if (event.type !== 'turn_end') return;
      ended.set(event.turnId, event.status);
      if (watching === event.turnId) resolveEnd(event.status);
    });

    let status: OwnerTurnResult['status'];
    try {
      const { turnId } = await api.prompt(handleId, contract);
      watching = turnId;
      status = ended.get(turnId) ?? (await new Promise<OwnerTurnResult['status']>((resolve) => {
        resolveEnd = resolve;
        this.waiting.set(opened.id, resolve);
      }));
    } catch (error) {
      this.deps.host.log(`owner turn failed for ${opened.id}: ${error instanceof Error ? error.message : String(error)}`);
      status = 'error';
    } finally {
      this.waiting.delete(opened.id);
      unsubscribe();
    }

    const declared = this.deps.outcomes.end(opened.id);
    const now = this.deps.host.now();
    // The usage read talks to the host, so it happens before the queued write.
    const usage = await api.getSessionUsage(handleId).catch(() => null);
    const next = await this.deps.store.update(opened.id, (fresh) => {
      let updated = applyTurnOutcome(fresh, declared, now);
      updated = { ...updated, session: { ...updated.session, lastWakeAt: now, lastWakeKind: wake.kind } };
      if (!usage) return updated;
      const delta = Math.max(0, usage.costUsd - updated.session.sessionCostUsd);
      return charge({ ...updated, session: { ...updated.session, sessionCostUsd: usage.costUsd } }, 'owner', delta, now);
    });
    return { record: next ?? opened, status, declared };
  }

  async dispose(projectId: string): Promise<void> {
    // End any turn still waiting first: the host stops delivering events to a
    // disposed handle, so nothing else would ever release the wait.
    const waiter = this.waiting.get(projectId);
    if (waiter) {
      this.waiting.delete(projectId);
      waiter('aborted');
    }
    const handleId = this.live.get(projectId);
    if (!handleId) return;
    this.live.delete(projectId);
    await this.api().dispose(handleId);
  }

  async disposeAll(): Promise<void> {
    await Promise.all([...this.live.keys()].map((id) => this.dispose(id)));
  }
}
