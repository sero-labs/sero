/**
 * `appRuntime.persistentSessions` — the host implementation (AD-029).
 *
 * Assembles the four pieces that make the boundary hold:
 *   builtin-gate  — only a bundled first-party plugin reaches this at all
 *   grant-store   — durable, crash-safe, atomic reservations
 *   validate      — fixed-order deny paths against the requesting SUBJECT
 *   live-sessions — handle registry and the transient event stream
 *
 * The plugin never constructs a session. It never names a path. It never
 * supplies authority. It asks; the host decides.
 */

import { SessionManager, createAgentSession } from '@earendil-works/pi-coding-agent';
import type { CreateAgentSessionOptions } from '@earendil-works/pi-coding-agent';
import type { ExtensionRuntimeContent } from '@sero-ai/common';
import type {
  PersistentSessionSubjectPolicy,
  PersistentSessionContextUsage,
  PersistentSessionEvent,
  PersistentSessionGrantHandle,
  PersistentSessionGrantProposal,
  PersistentSessionHandle,
  PersistentSessionHistoryPage,
  PersistentSessionRequest,
  PersistentSessionUsage,
  PersistentSessionsApi,
} from '@sero-ai/common';

import { GrantStore } from './grant-store';
import { LiveSessionRegistry } from './live-sessions';
import { readSessionHistoryPage } from './history';
import { validatePersistentSessionRequest } from './validate';

/** The parts of a Pi session the host assembles from the grant. */
export type SessionInputs = Pick<
  CreateAgentSessionOptions,
  'resourceLoader' | 'customTools' | 'modelRuntime' | 'settingsManager' | 'model' | 'thinkingLevel' | 'tools'
>;

/** Everything the host needs injected, so the whole surface is testable. */
export interface PersistentSessionHostDeps {
  /** App id of the runtime instance. Caller identity — never from a payload. */
  appId: string;
  grantStore: GrantStore;
  /**
   * Absolute directory this grant's sessions live under. Keyed by the
   * HOST-ISSUED grant id, so two grants can never share a directory — the
   * startup sweep removes files no subject is bound to, and a shared directory
   * would make one grant's sweep delete another grant's sessions.
   */
  resolveSessionDir(grantId: string): string;
  /**
   * Clamps a proposal to current user authority and the real workspace
   * catalogue, then asks the user to approve the clamped set. Returns null when
   * the user declines. The APPROVED set becomes the grant — the proposal never
   * does (architecture.md §3.1).
   */
  approveGrant(
    proposal: PersistentSessionGrantProposal,
  ): Promise<{ approvalId: string; approved: PersistentSessionGrantProposal } | null>;
  /** Model ids currently resolvable through the one host ModelRuntime (AD-026). */
  listAvailableModelIds(): Promise<Set<string>>;
  /** The thinking level Pi applies when a request omits one. */
  defaultThinking(): string;
  /**
   * Builds the filtered resource loader and platform tools from the APPROVED
   * policy. It receives the validated policy so the loader is derived from what
   * the user approved, never from the request.
   */
  buildSessionInputs(input: {
    /** Host-issued grant id and the validated subject: together, this session's identity. */
    grantId: string;
    subject: string;
    cwd: string;
    tools: string[];
    skills: string[];
    systemPromptAdditions: string[];
    policy: PersistentSessionSubjectPolicy;
  }): Promise<SessionInputs>;
  /** Resolves a validated model id to the Pi model the session runs. */
  resolveModel(modelId: string): Promise<CreateAgentSessionOptions['model']>;
  newId(prefix: string): string;
  log(message: string): void;
}

export class PersistentSessionHost implements PersistentSessionsApi {
  private readonly live = new LiveSessionRegistry();

  constructor(private readonly deps: PersistentSessionHostDeps) {}

  async requestGrant(proposal: PersistentSessionGrantProposal): Promise<PersistentSessionGrantHandle> {
    // Snapshot on ENTRY. Approval is asynchronous and the caller runs in this
    // same process, so without a copy taken here it could mutate its own
    // proposal object while the approval dialog is open and the host would
    // store the mutation.
    const decision = await this.deps.approveGrant(structuredClone(proposal));
    // The caller shows this to the user, so it must say what happened. "Not
    // approved" reads as a refusal even when nobody was ever asked.
    if (!decision) throw new Error('you did not allow agent sessions for this app');

    const grant = await this.deps.grantStore.issue(
      this.deps.appId,
      (grantId) => this.deps.resolveSessionDir(grantId),
      decision.approvalId,
      decision.approved,
    );

    return {
      grantId: grant.grantId,
      // A copy: the caller must not hold a reference into stored authority, or
      // it could widen its own policy after approval.
      subjects: structuredClone(grant.subjects),
      maxLiveSessions: grant.maxLiveSessions,
      maxTotalSessions: grant.maxTotalSessions,
      issuedAt: grant.issuedAt,
    };
  }

  async revokeGrant(grantId: string): Promise<void> {
    // Write-first: the revoked status is durable BEFORE anything is torn down,
    // so a crash mid-revocation leaves the grant revoked — the safe direction.
    const grant = await this.deps.grantStore.markRevoked(grantId);
    if (!grant) return;

    for (const entry of this.live.forGrant(grantId)) {
      await entry.session.abort().catch(() => undefined);
      this.live.remove(entry.handleId);
      entry.session.dispose();
    }
    this.deps.grantStore.clearLive(grantId);
  }

  async deleteGrant(grantId: string): Promise<void> {
    await this.revokeGrant(grantId);
    await this.deps.grantStore.deleteRevoked(grantId);
  }

  async create(request: PersistentSessionRequest): Promise<PersistentSessionHandle> {
    const validation = await this.validate({ ...request, operation: 'create' });

    const reservation = await this.deps.grantStore.reserve(request.grantId, request.subject);
    if (!reservation.ok) throw new Error(`Cannot create session: ${reservation.reason}.`);

    const grant = this.deps.grantStore.get(request.grantId);
    if (!grant) throw new Error('Cannot create session: grant-not-found.');

    try {
      // Pi names the file inside the grant's directory. The caller supplies no
      // path, so there is no path for it to aim.
      const sessionManager = SessionManager.create(validation.cwd, grant.sessionDir);
      const session = await this.buildSession(request, validation, sessionManager);

      const sessionPath = sessionManager.getSessionFile();
      if (!sessionPath) throw new Error('Pi returned no session file path.');

      // Deterministic name — this is the Usage plugin's grouping input (§8).
      sessionManager.appendSessionInfo(request.sessionName);

      const handleId = this.deps.newId('psh');
      const commit = await this.deps.grantStore.commitReservation(
        request.grantId, reservation.reservationId, handleId, sessionPath,
      );
      if (!commit.ok) {
        // Revocation won the race. The session exists but is unauthorised, so
        // it must not survive — the store cannot dispose it, only we can.
        session.dispose();
        throw new Error('Cannot create session: grant-revoked.');
      }

      const sessionId = sessionManager.getSessionId();
      this.live.add({ handleId, grantId: request.grantId, subject: request.subject, sessionId, sessionPath, session });
      return { handleId, subject: request.subject, sessionId, sessionPath };
    } catch (error) {
      await this.deps.grantStore.releaseReservation(request.grantId, reservation.reservationId);
      throw error;
    }
  }

  async open(request: PersistentSessionRequest): Promise<PersistentSessionHandle> {
    // Reopening the same subject returns the session already open, rather than
    // constructing a second one against the same file.
    const existing = this.live.forSubject(request.grantId, request.subject);
    if (existing) {
      return {
        handleId: existing.handleId,
        subject: existing.subject,
        sessionId: existing.sessionId,
        sessionPath: existing.sessionPath,
      };
    }

    const validation = await this.validate({ ...request, operation: 'open' });
    const sessionPath = validation.sessionPath;
    if (!sessionPath) throw new Error('Cannot open session: session-path-unregistered.');

    const grant = this.deps.grantStore.get(request.grantId);
    if (!grant) throw new Error('Cannot open session: grant-not-found.');

    const handleId = this.deps.newId('psh');
    const reservation = await this.deps.grantStore.reserveLive(request.grantId, request.subject, handleId);
    if (!reservation.ok) throw new Error(`Cannot open session: ${reservation.reason}.`);

    try {
      const sessionManager = SessionManager.open(sessionPath, grant.sessionDir, validation.cwd);
      const session = await this.buildSession(request, validation, sessionManager);
      const commit = await this.deps.grantStore.commitLive(request.grantId, handleId);
      if (!commit.ok) {
        // Revocation won the race while this session was being built. It could
        // not dispose a session that was not registered yet, so disposing it is
        // ours to do — same rule as `create`.
        session.dispose();
        throw new Error('Cannot open session: grant-revoked.');
      }
      const sessionId = sessionManager.getSessionId();
      this.live.add({ handleId, grantId: request.grantId, subject: request.subject, sessionId, sessionPath, session });
      return { handleId, subject: request.subject, sessionId, sessionPath };
    } catch (error) {
      this.deps.grantStore.releaseLive(request.grantId, handleId);
      throw error;
    }
  }

  async prompt(handleId: string, content: ExtensionRuntimeContent): Promise<{ turnId: string }> {
    const entry = this.requireLive(handleId);
    // Named BEFORE the message is sent. A fast turn can start and end while
    // `sendUserMessage` is still resolving, and those events must already carry
    // the id this call is about to return.
    const turnId = this.deps.newId('turn');
    this.live.beginTurn(handleId, turnId);
    await entry.session.sendUserMessage(toPiContent(content));
    return { turnId };
  }

  async steer(handleId: string, content: ExtensionRuntimeContent): Promise<void> {
    const entry = this.requireLive(handleId);
    await entry.session.sendUserMessage(toPiContent(content), { deliverAs: 'steer' });
  }

  async abort(handleId: string): Promise<void> {
    const entry = this.requireLive(handleId);
    // Pi reports no reason with the end of a run, so the cancellation is
    // remembered here — otherwise a cancelled turn is reported as finished.
    this.live.markAborting(handleId);
    await entry.session.abort();
  }

  subscribe(handleId: string, cb: (event: PersistentSessionEvent) => void): () => void {
    // Read-only and slot-free (NFR-017): a session nobody watches behaves the
    // same as one that is watched.
    this.requireLive(handleId);
    return this.live.watch(handleId, cb);
  }

  async compact(handleId: string): Promise<void> {
    await this.requireLive(handleId).session.compact();
  }

  async getContextUsage(handleId: string): Promise<PersistentSessionContextUsage> {
    const usage = this.requireLive(handleId).session.getContextUsage();
    // Pi reports null tokens right after a compaction, before the next reply.
    // Zero is the honest answer there — not a stale pre-compaction figure.
    return { usedTokens: usage?.tokens ?? 0, maxTokens: usage?.contextWindow ?? 0 };
  }

  async getSessionUsage(handleId: string): Promise<PersistentSessionUsage> {
    const entry = this.requireLive(handleId);
    const stats = entry.session.getSessionStats();
    return {
      inputTokens: stats?.tokens.input ?? 0,
      outputTokens: stats?.tokens.output ?? 0,
      cacheReadTokens: stats?.tokens.cacheRead ?? 0,
      cacheWriteTokens: stats?.tokens.cacheWrite ?? 0,
      costUsd: stats?.cost ?? 0,
      turns: entry.turnsTaken,
    };
  }

  async dispose(handleId: string): Promise<void> {
    const entry = this.live.remove(handleId);
    if (!entry) return;
    // Closes the live session. The file and the subject binding both survive —
    // that is what lets a member be reopened, and its history stay readable.
    entry.session.dispose();
    this.deps.grantStore.releaseLive(entry.grantId, handleId);
  }

  async readHistory(
    grantId: string,
    subject: string,
    options: { cursor?: string; limit?: number } = {},
  ): Promise<PersistentSessionHistoryPage> {
    const grant = this.deps.grantStore.get(grantId);
    if (!grant || grant.appId !== this.deps.appId) {
      throw new Error('Cannot read history: grant-not-found.');
    }
    const sessionPath = this.deps.grantStore.registeredSessionPath(grantId, subject);
    if (!sessionPath) return { entries: [], olderCursor: null };
    // Deliberately works for a DISPOSED subject: history outlives the live
    // session, which is what keeps a retired or failed member readable.
    return readSessionHistoryPage(sessionPath, options);
  }

  private async validate(request: PersistentSessionRequest) {
    const result = validatePersistentSessionRequest({
      request,
      grant: this.deps.grantStore.get(request.grantId),
      callerAppId: this.deps.appId,
      registeredSessionPath: this.deps.grantStore.registeredSessionPath(request.grantId, request.subject),
      availableModelIds: await this.deps.listAvailableModelIds(),
      defaultThinking: this.deps.defaultThinking(),
    });

    if (!result.ok) {
      this.deps.log(`persistent-session denied (${result.reason}): ${result.detail}`);
      throw new Error(`Persistent session denied: ${result.reason}.`);
    }
    return result;
  }

  private async buildSession(
    request: PersistentSessionRequest,
    validation: { cwd: string; thinking: string; policy: PersistentSessionSubjectPolicy },
    sessionManager: SessionManager,
  ) {
    const inputs = await this.deps.buildSessionInputs({
      grantId: request.grantId,
      subject: request.subject,
      cwd: validation.cwd,
      tools: request.tools,
      skills: request.skills,
      systemPromptAdditions: request.systemPromptAdditions ?? [],
      policy: validation.policy,
    });

    const { session } = await createAgentSession({
      ...inputs,
      cwd: validation.cwd,
      sessionManager,
      // These come AFTER the spread deliberately. Validation checked a specific
      // model and a specific effective thinking level; if the builder's own
      // choices were allowed to win, the session would run something other than
      // what was validated — and validation would be decorative.
      model: await this.deps.resolveModel(request.model),
      thinkingLevel: validation.thinking as CreateAgentSessionOptions['thinkingLevel'],
      // Only the approved tool names are enabled. `noTools: 'builtin'` alone
      // would leave every extension tool on. The list is the builder's, not the
      // request's: the builder applied the approved permission profile on top of
      // the allowlist, and the request has not — using the request here would
      // make the profile decorative.
      noTools: 'builtin',
      tools: inputs.tools,
    });
    return session;
  }

  private requireLive(handleId: string) {
    const entry = this.live.get(handleId);
    if (!entry) throw new Error(`No live session for handle ${handleId}.`);
    // Re-check on EVERY operation: a grant can be revoked between two calls on
    // the same handle.
    const grant = this.deps.grantStore.get(entry.grantId);
    if (!grant || grant.status !== 'active') {
      throw new Error(`Persistent session denied: grant-revoked.`);
    }
    return entry;
  }
}

function toPiContent(content: ExtensionRuntimeContent) {
  if (typeof content === 'string') return content;
  return content.map((block) =>
    block.type === 'text'
      ? { type: 'text' as const, text: block.text }
      : { type: 'image' as const, data: block.data, mimeType: block.mimeType },
  );
}
