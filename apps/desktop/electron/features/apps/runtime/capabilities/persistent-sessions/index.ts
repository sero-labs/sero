/**
 * Wiring for `appRuntime.persistentSessions` (AD-029).
 *
 * This is where the built-in gate is actually enforced: a runtime that does not
 * pass it never receives the capability at all, so its `host.persistentSessions`
 * is simply `undefined`. Declaring the capability in a manifest achieves
 * nothing — `SERO_HOST_CAPABILITIES` is a compatibility list, not an
 * authorisation.
 */

import path from 'path';
import { mkdir } from 'fs/promises';

import type { PersistentSessionGrantProposal, PersistentSessionsApi } from '@sero-ai/common';

import { SERO_SESSION_DIR } from '@electron/shared/infra/shared-infra';
import { appStateManager } from '@electron/features/apps/state/manager';
import { ensureAiInfra } from '@electron/shared/infra/ai-infra';
import { SERO_HOME } from '@electron/platform/env';

import { evaluateBuiltinGate } from './builtin-gate';
import { GrantStore, type StoredGrant } from './grant-store';
import { PersistentSessionHost, type SessionInputs } from './host';

export { evaluateBuiltinGate, isPersistentSessionBuiltin, PERSISTENT_SESSION_BUILTIN_APPS } from './builtin-gate';
export { GrantStore } from './grant-store';
export { PersistentSessionHost } from './host';

/** One store per profile — grants outlive any single runtime instance. */
let sharedGrantStore: GrantStore | null = null;

function grantStateFile(): string {
  return path.join(SERO_HOME, 'apps', 'persistent-sessions', 'grants.json');
}

/**
 * Grants are durable host state, reloaded before any runtime starts so a
 * runtime cannot race the store into issuing work against an unloaded grant.
 */
export async function getGrantStore(): Promise<GrantStore> {
  if (sharedGrantStore) return sharedGrantStore;

  const file = grantStateFile();
  const store = new GrantStore({
    persistence: {
      read: async () => (await appStateManager.read(file)) as Record<string, StoredGrant> | null,
      write: (grants) => appStateManager.update<Record<string, StoredGrant>>(file, () => grants),
    },
    now: () => new Date().toISOString(),
    newId: (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`,
  });
  await store.initialize();
  sharedGrantStore = store;
  return store;
}

export interface PersistentSessionWiring {
  appId: string;
  packagePath: string;
  workspaceId: string;
  /**
   * Clamps a proposal to current user authority and gets approval. Supplied by
   * the caller because approval presentation is a host-UI concern, not a
   * capability concern.
   */
  approveGrant: PersistentSessionHostDepsApproval;
  /** Builds the filtered member resource profile from the approved grant. */
  buildSessionInputs(input: {
    cwd: string;
    tools: string[];
    skills: string[];
    systemPromptAdditions: string[];
  }): Promise<SessionInputs>;
  log(message: string): void;
}

type PersistentSessionHostDepsApproval = (
  proposal: PersistentSessionGrantProposal,
) => Promise<{ approvalId: string; approved: PersistentSessionGrantProposal } | null>;

/**
 * Returns the capability, or **null** when the calling app is not a permitted
 * bundled plugin. A null return is the enforcement: there is no method to call.
 */
export async function createPersistentSessionsApi(
  wiring: PersistentSessionWiring,
): Promise<PersistentSessionsApi | null> {
  const gate = evaluateBuiltinGate({ appId: wiring.appId, packagePath: wiring.packagePath });
  if (!gate.allowed) {
    wiring.log(`persistent sessions refused for ${wiring.appId}: ${gate.reason}`);
    return null;
  }

  const grantStore = await getGrantStore();

  return new PersistentSessionHost({
    appId: wiring.appId,
    grantStore,
    // Host-derived, never proposal-derived: the opaque scope is used as a
    // directory segment, so it is sanitised rather than trusted.
    resolveSessionDir: (proposal) => path.join(SERO_SESSION_DIR, wiring.appId, sanitizeSegment(proposal.scope)),
    approveGrant: wiring.approveGrant,
    listAvailableModelIds: async () => {
      const { modelRuntime } = await ensureAiInfra();
      return new Set((await modelRuntime.getAvailable()).map((model) => model.id));
    },
    defaultThinking: () => 'medium',
    buildSessionInputs: wiring.buildSessionInputs,
    newId: (prefix) => `${prefix}_${Math.random().toString(36).slice(2, 10)}`,
    log: wiring.log,
  });
}

/**
 * `scope` is an opaque caller string that becomes a directory segment. Anything
 * that is not a safe segment character is replaced, so a caller cannot smuggle
 * a traversal through it even though the host never interprets its meaning.
 */
function sanitizeSegment(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^\.+/, '');
  return cleaned.length > 0 ? cleaned.slice(0, 64) : 'default';
}

/** Creates the grant's session directory. Called before the first `create`. */
export async function ensureGrantSessionDir(sessionDir: string): Promise<void> {
  await mkdir(sessionDir, { recursive: true });
}
