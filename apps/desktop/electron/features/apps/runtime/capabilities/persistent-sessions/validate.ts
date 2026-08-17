/**
 * Request validation for `appRuntime.persistentSessions` (AD-029 §3.5).
 *
 * Pure and synchronous apart from the model lookup, so every deny path is
 * directly testable. Steps run in a fixed order and each denies with a distinct
 * reason; no later step runs after a denial.
 *
 * The atomic reservation (step 11) is NOT here — it is a critical section owned
 * by the grant store, because a check followed by a create is a race.
 */

import { realpathSync } from 'fs';
import path from 'path';

import type {
  PersistentSessionPermissionProfile,
  PersistentSessionRequest,
  PersistentSessionSubjectPolicy,
} from '@sero-ai/common';
import type { StoredGrant } from './grant-store';

export type DenyReason =
  | 'grant-not-found'
  | 'grant-revoked'
  | 'caller-mismatch'
  | 'subject-not-granted'
  | 'session-path-escape'
  | 'session-path-unregistered'
  | 'subject-already-bound'
  | 'cwd-not-allowed'
  | 'model-not-allowed'
  | 'model-unavailable'
  | 'thinking-not-allowed'
  | 'tool-not-allowed'
  | 'skill-not-allowed'
  | 'prompt-additions-too-large';

export interface ValidationOk {
  ok: true;
  policy: PersistentSessionSubjectPolicy;
  /**
   * The file to open. Null for `create` — Pi names the file, and the host binds
   * the returned path once construction succeeds.
   */
  sessionPath: string | null;
  /** Absolute working directory, already symlink-resolved. */
  cwd: string;
  /** The level the caller must apply — the one that was actually validated. */
  thinking: string;
}

export interface ValidationDenied {
  ok: false;
  reason: DenyReason;
  detail: string;
}

export type ValidationResult = ValidationOk | ValidationDenied;

/** Total orders. "Within" is an index comparison — no lattice ambiguity. */
const PERMISSION_ORDER = {
  filesystem: ['none', 'read', 'write'],
  commands: ['none', 'readOnly', 'all'],
  network: ['none', 'fetch'],
  vcs: ['none', 'read', 'commit', 'push'],
} as const satisfies Record<keyof PersistentSessionPermissionProfile, readonly string[]>;

/**
 * True when every field of `requested` is at or below `allowed`. A field the
 * caller omitted is treated as the lowest level, never as inherited.
 */
export function isWithinPermissionProfile(
  requested: Partial<PersistentSessionPermissionProfile>,
  allowed: PersistentSessionPermissionProfile,
): boolean {
  return (Object.keys(PERMISSION_ORDER) as (keyof PersistentSessionPermissionProfile)[])
    .every((field) => {
      const order: readonly string[] = PERMISSION_ORDER[field];
      const requestedIndex = order.indexOf(requested[field] ?? order[0]);
      const allowedIndex = order.indexOf(allowed[field]);
      // An unrecognised value is not silently accepted.
      return requestedIndex >= 0 && allowedIndex >= 0 && requestedIndex <= allowedIndex;
    });
}

/** realpath, falling back to a lexical resolve for a path that does not exist yet. */
function canonical(target: string): string {
  try {
    return realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

/**
 * Containment after symlink resolution. Compares path segments rather than
 * string prefixes, so `/a/roots-evil` is not treated as inside `/a/roots`.
 */
function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  if (relative === '') return true;
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

function deny(reason: DenyReason, detail: string): ValidationDenied {
  return { ok: false, reason, detail };
}

export interface ValidateInput {
  request: PersistentSessionRequest;
  grant: StoredGrant | null;
  /** The app id of the runtime instance the host constructed — never from the payload. */
  callerAppId: string;
  /** Session path previously registered for this subject, when one exists. */
  registeredSessionPath: string | null;
  /** Model ids currently resolvable through the one host ModelRuntime. */
  availableModelIds: ReadonlySet<string>;
  /**
   * The level the host applies when the request omits `thinking`. Validated
   * like an explicit one — otherwise omitting the field would select an
   * unchecked default that the subject was never approved for.
   */
  defaultThinking: string;
}

export function validatePersistentSessionRequest(input: ValidateInput): ValidationResult {
  const { request, grant, callerAppId, registeredSessionPath, availableModelIds, defaultThinking } = input;

  // 1–2. grant resolves and is live
  if (!grant) return deny('grant-not-found', `No grant ${request.grantId}.`);
  if (grant.status !== 'active') return deny('grant-revoked', `Grant ${grant.grantId} is revoked.`);

  // 3. caller matches — identity comes from the runtime instance, not the payload
  if (grant.appId !== callerAppId) {
    return deny('caller-mismatch', `Grant ${grant.grantId} was not issued to ${callerAppId}.`);
  }

  // 4. subject has a policy; everything after validates against THIS subject
  const policy = grant.subjects[request.subject];
  if (!policy) {
    return deny('subject-not-granted', `Subject ${request.subject} is not in grant ${grant.grantId}.`);
  }

  // 5. path resolution
  let sessionPath: string | null;
  if (request.operation === 'create') {
    // A subject's binding is immutable: once it has a session it must `open`.
    // Re-creating would orphan the first session and leave the subject owning
    // two.
    if (registeredSessionPath) {
      return deny('subject-already-bound', `Subject ${request.subject} already has a session; use open.`);
    }
    // No path is computed. Pi creates the file inside the grant's session
    // directory and the host binds whatever it returns, after confirming
    // containment. The caller never names a path, so it cannot aim one.
    sessionPath = null;
  } else {
    // `open` takes NO caller path — one subject can never open another's file.
    if (!registeredSessionPath) {
      return deny('session-path-unregistered', `Subject ${request.subject} has no created session.`);
    }
    // Re-resolve on every open: the file exists now, so realpath resolves the
    // leaf itself and catches a symlink swapped in after the binding was made.
    if (!isInside(canonical(registeredSessionPath), canonical(grant.sessionDir))) {
      return deny('session-path-escape', `Registered path escapes ${grant.sessionDir}.`);
    }
    sessionPath = registeredSessionPath;
  }

  // 6. working directory, resolved before comparison
  const resolvedCwd = canonical(request.cwd);
  const cwdAllowed = policy.allowedCwds.some((root) => isInside(resolvedCwd, canonical(root)));
  if (!cwdAllowed) {
    return deny('cwd-not-allowed', `cwd ${request.cwd} is outside this subject's allowed roots.`);
  }

  // 7. model — in policy AND resolvable right now
  if (!policy.allowedModels.includes(request.model)) {
    return deny('model-not-allowed', `Model ${request.model} is not in this subject's policy.`);
  }
  if (!availableModelIds.has(request.model)) {
    return deny('model-unavailable', `Model ${request.model} is not available on this machine.`);
  }

  // 8. thinking level — caller-selectable and cost-bearing, so it is policed.
  // Validate the EFFECTIVE level: omitting the field must not be a way to reach
  // a host default the subject was never approved for.
  const effectiveThinking = request.thinking ?? defaultThinking;
  if (!policy.allowedThinkingLevels.includes(effectiveThinking)) {
    return deny('thinking-not-allowed', `Thinking level ${effectiveThinking} is not in this subject's policy.`);
  }

  // 9. tools and skills — an unknown name is a denial, not a silent drop
  const unknownTool = request.tools.find((tool) => !policy.allowedTools.includes(tool));
  if (unknownTool) {
    return deny('tool-not-allowed', `Tool ${unknownTool} is not in this subject's policy.`);
  }
  const unknownSkill = request.skills.find((skill) => !policy.allowedSkills.includes(skill));
  if (unknownSkill) {
    return deny('skill-not-allowed', `Skill ${unknownSkill} is not in this subject's policy.`);
  }

  // Permissions are NOT validated here: a request carries no permission profile.
  // The subject policy's profile is applied verbatim by the caller of this
  // function, so there is no subset negotiation and nothing to inflate.

  // 10. prompt additions — appended only, and size-bounded per subject
  const additionBytes = (request.systemPromptAdditions ?? [])
    .reduce((total, addition) => total + Buffer.byteLength(addition, 'utf8'), 0);
  if (additionBytes > policy.maxSystemPromptAdditionBytes) {
    return deny(
      'prompt-additions-too-large',
      `${additionBytes} bytes exceeds the ${policy.maxSystemPromptAdditionBytes}-byte cap.`,
    );
  }

  return { ok: true, policy, sessionPath, cwd: resolvedCwd, thinking: effectiveThinking };
}
