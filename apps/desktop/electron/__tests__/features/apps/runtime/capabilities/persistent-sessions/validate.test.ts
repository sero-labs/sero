/**
 * Deny tests for persistent-session request validation (architecture.md §3.5,
 * §4.2).
 *
 * Every case asserts the exact reason code, because a test that only asserts
 * "denied" passes for the wrong reason as soon as an earlier step starts
 * denying by accident. Path cases use real directories and real symlinks — a
 * mocked realpath would prove nothing about escape.
 */

import { mkdir, mkdtemp, realpath, symlink, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';
import { beforeAll, describe, expect, it } from 'vitest';

import type {
  PersistentSessionPermissionProfile,
  PersistentSessionRequest,
  PersistentSessionSubjectPolicy,
} from '@sero-ai/common';
import type { StoredGrant } from '@electron/features/apps/runtime/capabilities/persistent-sessions/grant-store';
import {
  isWithinPermissionProfile,
  validatePersistentSessionRequest,
  type DenyReason,
  type ValidateInput,
  type ValidationOk,
  type ValidationResult,
} from '@electron/features/apps/runtime/capabilities/persistent-sessions/validate';

const MODEL = 'anthropic/claude-opus-5';

let sessionDir = '';
let sessionDirLink = '';
let escapingSessionFile = '';
let outsideSessionFile = '';
let repo = '';
let repoSub = '';
let repoLink = '';
let repoSubLink = '';
let siblingRepo = '';
let outsideRepo = '';
let outsideRepoLink = '';

beforeAll(async () => {
  const tmp = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sero-session-validate-')));

  sessionDir = path.join(tmp, 'sessions', 'rooms', 'room-1');
  repo = path.join(tmp, 'repo');
  repoSub = path.join(repo, 'src');
  siblingRepo = path.join(tmp, 'repo-evil');
  outsideRepo = path.join(tmp, 'outside-repo');
  await mkdir(sessionDir, { recursive: true });
  await mkdir(repoSub, { recursive: true });
  await mkdir(siblingRepo, { recursive: true });
  await mkdir(outsideRepo, { recursive: true });

  // A session file inside the grant directory that is really a link out of it.
  outsideSessionFile = path.join(tmp, 'stolen.jsonl');
  escapingSessionFile = path.join(sessionDir, 'escaping.jsonl');
  await writeFile(outsideSessionFile, '');
  await symlink(outsideSessionFile, escapingSessionFile);
  await writeFile(path.join(sessionDir, 'existing.jsonl'), '');

  sessionDirLink = path.join(tmp, 'sessions-link');
  repoLink = path.join(tmp, 'repo-link');
  repoSubLink = path.join(tmp, 'src-link');
  outsideRepoLink = path.join(tmp, 'escape-link');
  await symlink(sessionDir, sessionDirLink);
  await symlink(repo, repoLink);
  await symlink(repoSub, repoSubLink);
  await symlink(outsideRepo, outsideRepoLink);
});

function policy(overrides: Partial<PersistentSessionSubjectPolicy> = {}): PersistentSessionSubjectPolicy {
  return {
    allowedCwds: [repo],
    allowedModels: [MODEL],
    allowedTools: ['read', 'edit'],
    allowedSkills: ['sero-plugin'],
    allowedThinkingLevels: ['low', 'medium'],
    permissionProfile: { filesystem: 'write', commands: 'readOnly', network: 'none', vcs: 'read' },
    maxSystemPromptAdditionBytes: 100,
    ...overrides,
  };
}

function grant(overrides: Partial<StoredGrant> = {}): StoredGrant {
  return {
    grantId: 'grant-1',
    appId: 'orchestrator',
    owner: 'room-1',
    scope: 'members',
    workspaceId: 'ws-1',
    sessionDir,
    subjects: {
      implementer: policy(),
      // A deliberately weaker peer: the reviewer must never inherit the
      // implementer's tools through a grant-wide union.
      reviewer: policy({ allowedTools: ['read'], allowedSkills: [], allowedThinkingLevels: ['low'] }),
    },
    maxLiveSessions: 2,
    maxTotalSessions: 4,
    approvalId: 'approval-1',
    status: 'active',
    issuedAt: '2026-08-14T00:00:00.000Z',
    sessionPaths: {},
    createdSessions: 0,
    pending: {},
    ...overrides,
  };
}

function request(overrides: Partial<PersistentSessionRequest> = {}): PersistentSessionRequest {
  return {
    grantId: 'grant-1',
    subject: 'implementer',
    operation: 'create',
    cwd: repo,
    model: MODEL,
    tools: ['read'],
    skills: [],
    sessionName: 'Room Test — Implementer',
    sessionFile: 'implementer.jsonl',
    ...overrides,
  };
}

function run(overrides: Partial<ValidateInput> = {}): ValidationResult {
  return validatePersistentSessionRequest({
    request: request(),
    grant: grant(),
    callerAppId: 'orchestrator',
    registeredSessionPath: null,
    availableModelIds: new Set([MODEL]),
    defaultThinking: 'low',
    ...overrides,
  });
}

/** The exact reason, or `allowed` — so a passing allow can never read as a pass. */
function outcome(result: ValidationResult): DenyReason | 'allowed' {
  return result.ok ? 'allowed' : result.reason;
}

function expectAllowed(result: ValidationResult): ValidationOk {
  if (!result.ok) throw new Error(`expected allow, denied with ${result.reason}: ${result.detail}`);
  return result;
}

describe('validatePersistentSessionRequest — grant and caller', () => {
  it('allows a well-formed create', () => {
    const result = expectAllowed(run());
    expect(result.sessionPath).toBe(path.join(sessionDir, 'implementer.jsonl'));
    expect(result.cwd).toBe(repo);
    expect(result.thinking).toBe('low');
    expect(result.policy.permissionProfile.commands).toBe('readOnly');
  });

  it('denies an unknown grant', () => {
    expect(outcome(run({ grant: null }))).toBe('grant-not-found');
  });

  it('denies a revoked grant before any other check', () => {
    const revoked = grant({ status: 'revoked', revokedAt: '2026-08-14T01:00:00.000Z' });
    // Also unknown subject and unknown model: the earliest step must win.
    const result = run({
      grant: revoked,
      request: request({ subject: 'ghost', model: 'openai/gpt-4' }),
    });
    expect(outcome(result)).toBe('grant-revoked');
  });

  it('denies when the calling runtime is not the grant holder', () => {
    expect(outcome(run({ callerAppId: 'evil-app' }))).toBe('caller-mismatch');
  });

  it('denies a subject with no policy', () => {
    expect(outcome(run({ request: request({ subject: 'ghost' }) }))).toBe('subject-not-granted');
  });
});

describe('validatePersistentSessionRequest — session paths', () => {
  it('denies a sessionFile containing a separator or a traversal', () => {
    for (const sessionFile of ['members/implementer.jsonl', '../implementer.jsonl', '/etc/passwd', '.', '..', '']) {
      expect(outcome(run({ request: request({ sessionFile }) }))).toBe('session-file-not-a-leaf');
    }
  });

  it('denies a create with no sessionFile at all', () => {
    expect(outcome(run({ request: request({ sessionFile: undefined }) }))).toBe('session-file-not-a-leaf');
  });

  it('keeps containment when the grant session directory is itself a symlink', () => {
    const result = expectAllowed(run({ grant: grant({ sessionDir: sessionDirLink }) }));
    expect(result.sessionPath).toBe(path.join(sessionDirLink, 'implementer.jsonl'));
  });

  it('denies a create whose leaf is a symlink planted in the session directory', () => {
    // The parent-containment check alone cannot see this: the parent IS the
    // session directory. Writing through the link would land outside it.
    expect(outcome(run({ request: request({ sessionFile: 'escaping.jsonl' }) })))
      .toBe('session-path-exists');
  });

  it('denies a create over an existing session file', () => {
    expect(outcome(run({ request: request({ sessionFile: 'existing.jsonl' }) })))
      .toBe('session-path-exists');
  });

  it('denies an open whose registered path escapes the session directory by symlink', () => {
    const result = run({
      request: request({ operation: 'open', sessionFile: undefined }),
      registeredSessionPath: escapingSessionFile,
    });
    expect(outcome(result)).toBe('session-path-escape');
  });

  it('denies an open whose registered path is outside the session directory', () => {
    const result = run({
      request: request({ operation: 'open', sessionFile: undefined }),
      registeredSessionPath: outsideSessionFile,
    });
    expect(outcome(result)).toBe('session-path-escape');
  });

  it('denies an open for a subject that has never created a session', () => {
    // The caller supplies another subject's real path; it must not be used.
    const result = run({
      request: request({
        subject: 'reviewer',
        operation: 'open',
        sessionFile: path.join(sessionDir, 'implementer.jsonl'),
      }),
      registeredSessionPath: null,
    });
    expect(outcome(result)).toBe('session-path-unregistered');
  });

  it('ignores a caller-supplied path on open and uses the registry', () => {
    const registered = path.join(sessionDir, 'reviewer.jsonl');
    const result = expectAllowed(
      run({
        request: request({
          subject: 'reviewer',
          operation: 'open',
          sessionFile: path.join(sessionDir, 'implementer.jsonl'),
        }),
        registeredSessionPath: registered,
      }),
    );
    expect(result.sessionPath).toBe(registered);
  });
});

describe('validatePersistentSessionRequest — working directory', () => {
  it('allows a directory inside an allowed root', () => {
    expect(outcome(run({ request: request({ cwd: repoSub }) }))).toBe('allowed');
  });

  it('resolves symlinks on both sides before comparing', () => {
    const viaLink = run({
      request: request({ cwd: repoSubLink }),
      grant: grant({ subjects: { implementer: policy({ allowedCwds: [repoLink] }) } }),
    });
    expect(outcome(viaLink)).toBe('allowed');
    expect(expectAllowed(viaLink).cwd).toBe(repoSub);
  });

  it('denies a cwd that escapes an allowed root through a symlink', () => {
    expect(outcome(run({ request: request({ cwd: outsideRepoLink }) }))).toBe('cwd-not-allowed');
  });

  it('denies a sibling directory that merely shares a name prefix', () => {
    expect(outcome(run({ request: request({ cwd: siblingRepo }) }))).toBe('cwd-not-allowed');
  });

  it('denies a cwd allowed for another subject only', () => {
    const scoped = grant({
      subjects: {
        implementer: policy({ allowedCwds: [outsideRepo] }),
        reviewer: policy({ allowedCwds: [repo] }),
      },
    });
    expect(outcome(run({ grant: scoped, request: request({ subject: 'reviewer', cwd: outsideRepo }) })))
      .toBe('cwd-not-allowed');
  });
});

describe('validatePersistentSessionRequest — capabilities', () => {
  it('denies a model outside the subject policy', () => {
    const result = run({
      request: request({ model: 'openai/gpt-4' }),
      availableModelIds: new Set([MODEL, 'openai/gpt-4']),
    });
    expect(outcome(result)).toBe('model-not-allowed');
  });

  it('denies a policy model that is not resolvable right now', () => {
    expect(outcome(run({ availableModelIds: new Set<string>() }))).toBe('model-unavailable');
  });

  it('denies a thinking level outside the subject policy', () => {
    expect(outcome(run({ request: request({ thinking: 'ultra' }) }))).toBe('thinking-not-allowed');
    // The peer subject is approved for `low` only, so `medium` is a denial for it.
    expect(outcome(run({ request: request({ subject: 'reviewer', thinking: 'medium' }) })))
      .toBe('thinking-not-allowed');
  });

  it('validates the host default when the request omits the thinking level', () => {
    // Omitting the field must not be a way to reach an unapproved default.
    expect(outcome(run({ request: request({ thinking: undefined }), defaultThinking: 'ultra' })))
      .toBe('thinking-not-allowed');
    const allowedByDefault = expectAllowed(
      run({ request: request({ thinking: undefined }), defaultThinking: 'medium' }),
    );
    expect(allowedByDefault.thinking).toBe('medium');
  });

  it('denies a tool outside the subject policy', () => {
    expect(outcome(run({ request: request({ tools: ['read', 'gh'] }) }))).toBe('tool-not-allowed');
  });

  it('denies a tool another subject holds', () => {
    // The union across subjects contains `edit`; the reviewer's policy does not.
    expect(outcome(run({ request: request({ subject: 'reviewer', tools: ['edit'] }) })))
      .toBe('tool-not-allowed');
  });

  it('denies a skill outside the subject policy', () => {
    expect(outcome(run({ request: request({ skills: ['sero-plugin', 'deploy'] }) })))
      .toBe('skill-not-allowed');
    expect(outcome(run({ request: request({ subject: 'reviewer', skills: ['sero-plugin'] }) })))
      .toBe('skill-not-allowed');
  });

  it('denies prompt additions above the subject cap, counted in bytes', () => {
    // 51 two-byte characters: over the 100-byte cap while under it by length,
    // so a character count would wrongly pass this.
    const multiByte = 'é'.repeat(51);
    expect(Buffer.byteLength(multiByte, 'utf8')).toBe(102);
    expect(outcome(run({ request: request({ systemPromptAdditions: [multiByte] }) })))
      .toBe('prompt-additions-too-large');
  });

  it('sums prompt additions across entries', () => {
    const parts = ['a'.repeat(60), 'b'.repeat(60)];
    expect(outcome(run({ request: request({ systemPromptAdditions: parts }) })))
      .toBe('prompt-additions-too-large');
    expect(outcome(run({ request: request({ systemPromptAdditions: ['a'.repeat(100)] }) })))
      .toBe('allowed');
  });
});

describe('isWithinPermissionProfile', () => {
  const allowed: PersistentSessionPermissionProfile = {
    filesystem: 'read',
    commands: 'readOnly',
    network: 'none',
    vcs: 'commit',
  };

  it('accepts an equal or lower profile', () => {
    expect(isWithinPermissionProfile(allowed, allowed)).toBe(true);
    expect(isWithinPermissionProfile({ filesystem: 'none', vcs: 'read' }, allowed)).toBe(true);
  });

  it('treats an omitted field as none, never as inherited', () => {
    expect(isWithinPermissionProfile({}, allowed)).toBe(true);
    expect(isWithinPermissionProfile({}, { filesystem: 'none', commands: 'none', network: 'none', vcs: 'none' }))
      .toBe(true);
  });

  it('denies a profile above the allowed one in any single field', () => {
    expect(isWithinPermissionProfile({ filesystem: 'write' }, allowed)).toBe(false);
    expect(isWithinPermissionProfile({ commands: 'all' }, allowed)).toBe(false);
    expect(isWithinPermissionProfile({ network: 'fetch' }, allowed)).toBe(false);
    expect(isWithinPermissionProfile({ vcs: 'push' }, allowed)).toBe(false);
  });

  it('denies an unrecognised level', () => {
    // A corrupted stored profile is by definition not typeable — constructing
    // one is the point of this case.
    const malformed = { filesystem: 'admin' } as unknown as PersistentSessionPermissionProfile;
    expect(isWithinPermissionProfile(malformed, allowed)).toBe(false);
    expect(isWithinPermissionProfile({ filesystem: 'read' }, malformed)).toBe(false);
  });
});
