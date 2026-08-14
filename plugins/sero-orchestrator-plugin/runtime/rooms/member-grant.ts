/**
 * Member authority: the grant proposal, the per-subject policy it carries, and
 * the blueprint→record projection activation uses (spec §14.4, architecture §3).
 *
 * Everything here is a PROJECTION of the validated blueprint. The proposal is an
 * input to the user's approval, never a source of authority: the host clamps it
 * to real user authority, shows the clamped set, stores that as the grant, and
 * hands back only a grant id. A runtime can never widen a grant it holds.
 *
 * The rule that shapes the whole file is PER-SUBJECT policy. With one flat
 * capability list a read-only reviewer could ask for the implementer's push tool
 * and pass validation, because the union contained it.
 */

import type {
  PersistentSessionGrantHandle,
  PersistentSessionPermissionProfile,
  PersistentSessionRequest,
  PersistentSessionSubjectPolicy,
  PersistentSessionsApi,
} from '@sero-ai/common';
import { ROOM_PROTOCOL_CAPABILITIES, accessLabelForCapability } from '../../shared/room-access-map';
import type {
  BlueprintMember,
  MemberPermissionLevel,
  OperatingEnvelope,
} from '../../shared/room-blueprint-types';
import { ROOM_COMMANDS } from '../../shared/room-commands';
import type { Room, RoomMember } from '../../shared/room-types';
import type { OrchestratorHost } from '../host';

/**
 * Filesystem, command and VCS reach follow directly from the permission level
 * the user approved. Network does not — see `permissionProfileFor`.
 */
const PERMISSION_PROFILES: Record<MemberPermissionLevel, PersistentSessionPermissionProfile> = {
  // A reviewer has to read the tree and inspect history to say anything useful,
  // so it reads files, runs read-only commands and reads VCS. It cannot write a
  // file, run an arbitrary command or commit — the three ways a "review" quietly
  // becomes a change.
  'read-only': { filesystem: 'read', commands: 'readOnly', network: 'none', vcs: 'read' },
  // An implementer edits files and commits in its own working copy. Push stays
  // out: publishing work to a remote is the step the access map warns about, and
  // the user approves it separately as `edit-and-push`.
  'edit-workspace': { filesystem: 'write', commands: 'all', network: 'none', vcs: 'commit' },
  // The only level that reaches a remote at all. Nothing below it may push, so
  // "can push branches and open pull requests" always names exactly this level.
  'edit-and-push': { filesystem: 'write', commands: 'all', network: 'none', vcs: 'push' },
};

/** Headroom over the approved identity text, so a small edit is not a denial. */
const PROMPT_ADDITION_HEADROOM_BYTES = 512;

/** Live sessions kept open beyond the ones the scheduler can be running. */
const LIVE_SESSION_HEADROOM = 2;

function reachesInternet(member: RoomMember): boolean {
  return [...member.configuration.tools, ...member.configuration.skills].some(
    (capability) => accessLabelForCapability(capability) === 'reach-internet',
  );
}

/**
 * The profile the host applies verbatim to this member's session.
 *
 * Network reach is deliberately NOT read from the permission level: the fixed
 * access map treats it as its own group, because a read-only researcher needs
 * the internet and an implementer often does not. Deriving it from the level
 * would let an edit permission silently buy outbound network.
 */
export function permissionProfileFor(member: RoomMember): PersistentSessionPermissionProfile {
  return {
    ...PERMISSION_PROFILES[member.configuration.permissions],
    network: reachesInternet(member) ? 'fetch' : 'none',
  };
}

/**
 * Every member holds the AD-020 `sero-cli` bridge: it is how a member talks to
 * its own Room, and it opens nothing outside the Room (spec §14.5). It is added
 * here rather than expected in the blueprint, so a planner that forgets it
 * cannot produce a member that is unable to answer a question.
 */
export function memberTools(member: RoomMember): string[] {
  return [...new Set([...member.configuration.tools, ...ROOM_PROTOCOL_CAPABILITIES])];
}

/**
 * The directories this member may work in.
 *
 * A member that edits in isolation is pinned to its OWN worktree — not to the
 * managed worktree root, which would let one member work in another's tree. A
 * worktree member with no worktree yet is a defect in activation ordering: the
 * fallback would be the shared working tree, which is exactly the reach the
 * worktree exists to avoid, so it fails loudly instead.
 */
export function memberCwdRoots(host: OrchestratorHost, member: RoomMember): string[] {
  if (!member.configuration.needsWorktree) return [host.workspacePath];
  if (!member.worktreePath) {
    throw new Error(`member ${member.id} needs a worktree, but none was created before the grant was requested`);
  }
  return [member.worktreePath];
}

/**
 * The Room protocol block (spec §14.5): how a member asks, replies, waits and
 * publishes. Built from the command table, so a command added there can never
 * go unmentioned here.
 */
export function buildRoomProtocolPrompt(member: RoomMember): string {
  const commands = ROOM_COMMANDS.filter((command) => !command.conductorOnly || member.isConductor)
    .map((command) => `- ${command.id}: ${command.label}`)
    .join('\n');
  return [
    '## Room protocol',
    'You work with the other members through Room commands, run with the sero-cli tool.',
    'Ask when you are blocked, reply when you are asked, and wait rather than guessing.',
    'Waiting costs nothing: your turn ends, and it resumes when the answer arrives.',
    // The work board is the only record of progress the Room can read. Messages
    // are not progress, so a Room whose members only talk is stopped as stalled
    // however much work they are really doing.
    'Put your work on the work board with update-work, and update it as it moves.',
    'That board is how the Room knows anything is happening.',
    ...(member.isConductor ? ['Write the plan on the board before you ask anyone to start.'] : []),
    '',
    'Commands available to you:',
    commands,
  ].join('\n');
}

/**
 * The STABLE half of a member's prompt: identity and the Room protocol, both of
 * which live as long as the session does. The mutable mandate is deliberately
 * absent — it arrives with each turn as Room context (§13.3), so a mandate
 * revision never rebuilds a session and never disturbs the cached system-prompt
 * prefix (§24.2).
 *
 * The protocol is a SESSION resource, not turn text (spec §14.5, Phase 4). Put
 * in a turn body it would be summarised away by the first compaction, and the
 * member would spend the rest of the Room unable to name the command that ends
 * its own wait.
 *
 * A role change is a fundamental identity change, which creates a REPLACEMENT
 * member with its own session, so the role recorded here cannot go stale.
 */
export function buildMemberPromptAdditions(room: Room, member: RoomMember): string[] {
  const identity = [
    `You are ${member.displayName}, the ${member.mandate.role} in the Room "${room.definition.title}".`,
    member.responsibility,
    room.definition.blueprint.roomInstructions,
  ]
    .filter((line) => line.trim().length > 0)
    .join('\n\n');
  return [identity, buildRoomProtocolPrompt(member), ...member.configuration.promptAdditions];
}

function promptAdditionCap(additions: string[]): number {
  const size = additions.reduce((total, block) => total + Buffer.byteLength(block, 'utf8'), 0);
  // Sized from the approved blueprint rather than from a round number: the
  // additions are built from the same blueprint the user approved, so anything
  // materially larger is a defect and should be denied.
  return size + PROMPT_ADDITION_HEADROOM_BYTES;
}

/**
 * One subject's policy. Models and thinking levels are pinned to the member's
 * own choice rather than to the Room's approved pool: both move cost, and a
 * Conductor that changes either is making a configuration revision, which
 * travels through the host authority boundary as a new grant (FR-041).
 */
export function memberSubjectPolicy(
  host: OrchestratorHost,
  room: Room,
  member: RoomMember,
): PersistentSessionSubjectPolicy {
  return {
    allowedCwds: memberCwdRoots(host, member),
    allowedModels: [member.configuration.model],
    allowedThinkingLevels: [member.configuration.thinking],
    allowedTools: memberTools(member),
    allowedSkills: [...member.configuration.skills],
    permissionProfile: permissionProfileFor(member),
    maxSystemPromptAdditionBytes: promptAdditionCap(buildMemberPromptAdditions(room, member)),
  };
}

/**
 * Live sessions the pool may hold open for one Room.
 *
 * It must stay above the scheduler's concurrency, or the pool would be asked to
 * close a session that is mid-turn: `maxActiveTurns`, plus the Conductor's
 * reserved slot, plus headroom so a member that just spoke is still warm when it
 * is picked again. Never more than the roster can hold.
 */
export function roomLiveSessionCap(envelope: OperatingEnvelope): number {
  return Math.min(envelope.maxMembers, envelope.maxActiveTurns + 1 + LIVE_SESSION_HEADROOM);
}

/**
 * Sessions this Room may ever create: one per member the roster may hold, plus
 * one per approved replacement. A replacement is a NEW session and the old file
 * is kept, so its history stays readable for the Room's lifetime.
 */
function roomTotalSessionCap(envelope: OperatingEnvelope): number {
  return envelope.maxMembers + envelope.maxMemberReplacements;
}

/**
 * The capability, or a loud failure. Absent means this host build did not
 * install it for this plugin (architecture §3.6). There is no fallback: building
 * a Pi session here is precisely what the boundary exists to prevent.
 */
export function requirePersistentSessions(host: OrchestratorHost): PersistentSessionsApi {
  const api = host.persistentSessions;
  if (!api) {
    throw new Error('Rooms need the appRuntime.persistentSessions capability, which this host did not provide.');
  }
  return api;
}

/**
 * Proposes the Room's grant: one subject per member, keyed by member id.
 *
 * The authority in each subject comes from the member's `configuration`, which
 * `toMemberRecord` copies verbatim from the validated blueprint and which only a
 * validated configuration revision may change (FR-041). `owner` and `scope` are
 * opaque strings — the host stores them and never parses a Room id out of them.
 */
export async function requestRoomGrant(host: OrchestratorHost, room: Room): Promise<PersistentSessionGrantHandle> {
  // `async` so a rejected precondition (a missing capability, a member with no
  // worktree) reaches an awaiting caller as a rejection rather than as a
  // synchronous throw it never expected from a promise-returning call.
  const api = requirePersistentSessions(host);
  const subjects: Record<string, PersistentSessionSubjectPolicy> = {};
  for (const member of room.members) {
    subjects[member.id] = memberSubjectPolicy(host, room, member);
  }
  return api.requestGrant({
    owner: `room:${room.definition.id}`,
    scope: 'room-members',
    workspaceId: host.workspaceId,
    subjects,
    maxLiveSessions: roomLiveSessionCap(room.definition.envelope),
    maxTotalSessions: roomTotalSessionCap(room.definition.envelope),
    reason: `Run ${room.members.length} members for the Room "${room.definition.title}".`,
  });
}

/**
 * `Room <title> — <role>`.
 *
 * Deterministic on purpose: together with the `rooms/<roomId>/` path this string
 * is the Usage plugin's ONLY grouping input (architecture §8). Changing its
 * shape silently un-groups a Room's cost into unexplained ordinary chats.
 */
export function memberSessionName(room: Room, member: RoomMember): string {
  return `Room ${room.definition.title} — ${member.mandate.role}`;
}

/** The create/open request for one member. Neither operation carries a path. */
export function memberSessionRequest(
  host: OrchestratorHost,
  room: Room,
  member: RoomMember,
  operation: PersistentSessionRequest['operation'],
): PersistentSessionRequest {
  const grantId = room.definition.grantId;
  if (!grantId) throw new Error(`room ${room.definition.id} has no session grant`);
  return {
    grantId,
    subject: member.session.subject,
    operation,
    cwd: memberCwdRoots(host, member)[0],
    model: member.configuration.model,
    thinking: member.configuration.thinking,
    tools: memberTools(member),
    skills: [...member.configuration.skills],
    systemPromptAdditions: buildMemberPromptAdditions(room, member),
    sessionName: memberSessionName(room, member),
  };
}

/**
 * Turns one validated blueprint member into the runtime record.
 *
 * The blueprint key becomes the member id AND the session subject, so the
 * subject the host binds to a session file is the same identity the Room
 * schedules, messages and bills.
 */
export function toMemberRecord(
  blueprintMember: BlueprintMember,
  roomId: string,
  now: string,
  workspaceId: string,
): RoomMember {
  return {
    id: blueprintMember.key,
    roomId,
    displayName: blueprintMember.displayName,
    isConductor: blueprintMember.isConductor,
    responsibility: blueprintMember.responsibility,
    status: 'starting',
    statusDetail: 'Waiting for its first turn.',
    mandate: {
      role: blueprintMember.role,
      responsibilities: blueprintMember.responsibility,
      currentTask: '',
      priorities: [],
      workingInstructions: blueprintMember.mandate,
      revision: 1,
      updatedAt: now,
    },
    configuration: {
      model: blueprintMember.model,
      thinking: blueprintMember.thinking,
      promptAdditions: [...blueprintMember.promptAdditions],
      tools: [...blueprintMember.tools],
      skills: [...blueprintMember.skills],
      permissions: blueprintMember.permissions,
      needsWorktree: blueprintMember.needsWorktree,
      revision: 1,
    },
    session: {
      subject: blueprintMember.key,
      sessionId: null,
      sessionPath: null,
      workspaceId,
      liveHandleId: null,
      lastOpenedAt: null,
      lastClosedAt: null,
      compactionCount: 0,
      lastCompactedAt: null,
    },
    usage: {
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      turns: 0,
      retries: 0,
      consecutiveFailures: 0,
    },
    worktreePath: null,
    worktreeBranch: null,
    waitingOnQuestionId: null,
    replacedByMemberId: null,
    createdAt: now,
    retiredAt: null,
  };
}
