/**
 * Clamping a grant proposal to authority the host can actually verify (AD-029 §3.1).
 *
 * A proposal is an INPUT to a user decision, never a source of authority. If the
 * host stores a proposal after checking only part of it, then "authority comes
 * from a host-stored approval" is true in shape and false in substance: the
 * unchecked fields still came from the caller.
 *
 * So every field is either verified against something real (a registered
 * workspace, the resolvable model list, the workspace's tool catalogue) or
 * capped at a host maximum. A name the host cannot resolve is DROPPED rather
 * than trusted — dropping is safe, trusting is not.
 */

import { realpathSync } from 'fs';
import path from 'path';

import type {
  PersistentSessionGrantProposal,
  PersistentSessionPermissionProfile,
  PersistentSessionSubjectPolicy,
} from '@sero-ai/common';

/** Host maxima. A caller may ask for less; it can never obtain more. */
export const PERSISTENT_SESSION_CAPS = {
  maxLiveSessions: 8,
  maxTotalSessions: 64,
  maxSystemPromptAdditionBytes: 16_384,
} as const;

const THINKING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];

export interface ClampInputs {
  /** Absolute roots the user already holds — registered workspaces and their worktrees. */
  workspaceRoots: string[];
  /** Model ids resolvable through the one host ModelRuntime. */
  availableModels: ReadonlySet<string>;
  /** Tool names this workspace really exposes. */
  availableTools: ReadonlySet<string>;
  /** Skill names really available. */
  availableSkills: ReadonlySet<string>;
  /** The strongest profile the user's own authority permits here. */
  permissionCeiling: PersistentSessionPermissionProfile;
}

/** What was removed, so the approval can state it rather than silently shrink. */
export interface ClampNote {
  subject: string;
  field: string;
  dropped: string[];
}

export interface ClampedProposal {
  proposal: PersistentSessionGrantProposal;
  notes: ClampNote[];
}

const PERMISSION_ORDER = {
  filesystem: ['none', 'read', 'write'],
  commands: ['none', 'readOnly', 'all'],
  network: ['none', 'fetch'],
  vcs: ['none', 'read', 'commit', 'push'],
} as const satisfies Record<keyof PersistentSessionPermissionProfile, readonly string[]>;

function canonical(target: string): string {
  try {
    return realpathSync(target);
  } catch {
    return path.resolve(target);
  }
}

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** The lower of two levels, per field. Never raises. */
function capProfile(
  requested: PersistentSessionPermissionProfile,
  ceiling: PersistentSessionPermissionProfile,
): PersistentSessionPermissionProfile {
  const capField = <K extends keyof PersistentSessionPermissionProfile>(field: K): PersistentSessionPermissionProfile[K] => {
    const order: readonly string[] = PERMISSION_ORDER[field];
    const requestedIndex = order.indexOf(requested[field]);
    const ceilingIndex = order.indexOf(ceiling[field]);
    // An unrecognised requested value falls to the lowest level rather than
    // being passed through as-is.
    const index = requestedIndex < 0 ? 0 : Math.min(requestedIndex, ceilingIndex);
    return order[index] as PersistentSessionPermissionProfile[K];
  };

  return {
    filesystem: capField('filesystem'),
    commands: capField('commands'),
    network: capField('network'),
    vcs: capField('vcs'),
  };
}

function keepKnown(requested: string[], available: ReadonlySet<string>): { kept: string[]; dropped: string[] } {
  const kept = requested.filter((name) => available.has(name));
  return { kept, dropped: requested.filter((name) => !available.has(name)) };
}

function clampSubject(
  subject: string,
  policy: PersistentSessionSubjectPolicy,
  inputs: ClampInputs,
  notes: ClampNote[],
): PersistentSessionSubjectPolicy {
  const roots = inputs.workspaceRoots.map(canonical);
  const cwds = policy.allowedCwds.filter((cwd) => roots.some((root) => isInside(canonical(cwd), root)));
  const droppedCwds = policy.allowedCwds.filter((cwd) => !cwds.includes(cwd));
  if (droppedCwds.length > 0) notes.push({ subject, field: 'allowedCwds', dropped: droppedCwds });

  const models = keepKnown(policy.allowedModels, inputs.availableModels);
  if (models.dropped.length > 0) notes.push({ subject, field: 'allowedModels', dropped: models.dropped });

  const tools = keepKnown(policy.allowedTools, inputs.availableTools);
  if (tools.dropped.length > 0) notes.push({ subject, field: 'allowedTools', dropped: tools.dropped });

  const skills = keepKnown(policy.allowedSkills, inputs.availableSkills);
  if (skills.dropped.length > 0) notes.push({ subject, field: 'allowedSkills', dropped: skills.dropped });

  const thinking = keepKnown(policy.allowedThinkingLevels, new Set(THINKING_LEVELS));
  if (thinking.dropped.length > 0) notes.push({ subject, field: 'allowedThinkingLevels', dropped: thinking.dropped });

  return {
    allowedCwds: cwds,
    allowedModels: models.kept,
    allowedTools: tools.kept,
    allowedSkills: skills.kept,
    allowedThinkingLevels: thinking.kept,
    permissionProfile: capProfile(policy.permissionProfile, inputs.permissionCeiling),
    maxSystemPromptAdditionBytes: Math.min(
      Math.max(0, policy.maxSystemPromptAdditionBytes),
      PERSISTENT_SESSION_CAPS.maxSystemPromptAdditionBytes,
    ),
  };
}

/**
 * Snapshots and clamps. The snapshot matters: approval is asynchronous, and the
 * caller runs in the same process — without a deep copy taken on entry it could
 * mutate its own proposal object while the approval dialog is open, and the host
 * would store the mutation.
 */
export function clampProposal(
  proposal: PersistentSessionGrantProposal,
  inputs: ClampInputs,
): ClampedProposal {
  const snapshot = structuredClone(proposal);
  const notes: ClampNote[] = [];

  const subjects = Object.fromEntries(
    Object.entries(snapshot.subjects).map(([subject, policy]) => [
      subject,
      clampSubject(subject, policy, inputs, notes),
    ]),
  );

  return {
    proposal: {
      owner: snapshot.owner,
      scope: snapshot.scope,
      workspaceId: snapshot.workspaceId,
      subjects,
      maxLiveSessions: Math.min(Math.max(1, snapshot.maxLiveSessions), PERSISTENT_SESSION_CAPS.maxLiveSessions),
      maxTotalSessions: Math.min(Math.max(1, snapshot.maxTotalSessions), PERSISTENT_SESSION_CAPS.maxTotalSessions),
      reason: String(snapshot.reason ?? '').slice(0, 500),
    },
    notes,
  };
}

/**
 * Plain-English summary of what the clamped grant permits, for the approval
 * dialog. The user has to be shown the authority they are approving — a dialog
 * that says only "3 agents" is consent to a number, not to a capability.
 */
export function describeGrantAuthority(proposal: PersistentSessionGrantProposal): string[] {
  const policies = Object.values(proposal.subjects);
  const union = <K extends 'allowedTools' | 'allowedSkills'>(field: K): string[] =>
    [...new Set(policies.flatMap((policy) => policy[field]))].sort();

  const strongest = <K extends keyof PersistentSessionPermissionProfile>(field: K): string =>
    policies.reduce<string>((highest, policy) => {
      const order: readonly string[] = PERMISSION_ORDER[field];
      return order.indexOf(policy.permissionProfile[field]) > order.indexOf(highest)
        ? policy.permissionProfile[field]
        : highest;
    }, PERMISSION_ORDER[field][0]);

  const lines: string[] = [];
  const filesystem = strongest('filesystem');
  if (filesystem === 'write') lines.push('Read and edit files in this workspace');
  else if (filesystem === 'read') lines.push('Read files in this workspace');

  if (strongest('commands') === 'all') lines.push('Run commands');
  if (strongest('network') !== 'none') lines.push('Reach the internet');

  const vcs = strongest('vcs');
  if (vcs === 'push') lines.push('Push branches and open pull requests');
  else if (vcs === 'commit') lines.push('Commit locally');

  const tools = union('allowedTools');
  if (tools.length > 0) lines.push(`Tools: ${tools.join(', ')}`);

  const roots = [...new Set(policies.flatMap((policy) => policy.allowedCwds))];
  if (roots.length > 0) lines.push(`Working in: ${roots.join(', ')}`);

  return lines;
}
