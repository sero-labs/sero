/**
 * Room blueprint, operating envelope and the computed proposal (spec §10, §12).
 *
 * The planner authors a `RoomBlueprint`. Application code computes
 * `RoomProposalSummary` from the VALIDATED blueprint — never the other way
 * round, and never from planner prose. That is the whole point of the split:
 * the summary the user approves and the blueprint the runtime enforces are two
 * projections of one object, so they cannot disagree (NFR-015).
 *
 * Split from room-types.ts to keep each file within the 500-line limit.
 */

/** Hard boundary the user approves. Neither planner nor Conductor can raise it. */
export interface OperatingEnvelope {
  maxMembers: number;
  maxActiveTurns: number;
  maxRosterRevisions: number;
  maxMemberReplacements: number;
  maxWallClockMs: number;
  maxCostUsd: number;
  maxCostUsdPerMember: number;
  maxTokens: number;
  maxTokensPerMember: number;
  maxTurnsPerMember: number;
  maxRetriesPerMember: number;
  maxConsecutiveFailures: number;
  /** Model ids the Conductor may assign from. A subset of what the user holds. */
  allowedModels: string[];
  allowedThinkingLevels: string[];
  allowedTools: string[];
  allowedSkills: string[];
  workspacePolicy: RoomWorkspacePolicy;
  /** Delivery destination ids this Room may use. */
  allowedDeliveryDestinations: string[];
  /** Nested subagents are off in the first release. */
  allowNestedSubagents: boolean;
  /** Idle time before the Room pauses for the user. */
  maxIdleMs: number;
}

export type RoomWorkspaceMode = 'read-only-shared' | 'worktree-per-member' | 'shared-working-tree';

export interface RoomWorkspacePolicy {
  mode: RoomWorkspaceMode;
  /** `shared-working-tree` is only reachable with an explicit user approval. */
  sharedTreeApproved: boolean;
  /** Overlapping path claims warn by default; block is opt-in. */
  claimPolicy: 'warn' | 'block';
}

export type MemberPermissionLevel = 'read-only' | 'edit-workspace' | 'edit-and-push';

/** One proposed member. It needs no saved agent file (FR-006). */
export interface BlueprintMember {
  /** Stable within the blueprint; becomes the member id on activation. */
  key: string;
  displayName: string;
  role: string;
  /** One line, user-facing. Planner prose. */
  responsibility: string;
  /** The full working instructions. Planner prose. */
  mandate: string;
  isConductor: boolean;
  model: string;
  thinking: string;
  /** Appended after the base prompt. Never replaces it. */
  promptAdditions: string[];
  tools: string[];
  skills: string[];
  permissions: MemberPermissionLevel;
  needsWorktree: boolean;
  /** Why this member exists. Planner prose, shown under "Why this team?". */
  reasonForInclusion: string;
}

export interface RoomBlueprint {
  schemaVersion: number;
  title: string;
  /** One sentence. Planner prose. */
  approach: string;
  objective: string;
  successCriteria: string[];
  roomInstructions: string;
  members: BlueprintMember[];
  /** Why this team, as a whole. Planner prose. */
  teamRationale: string;
  collaborationStrategy: string;
  workspacePolicy: RoomWorkspacePolicy;
  envelope: OperatingEnvelope;
  estimatedDurationMs: number;
  estimatedCostUsd: number;
  deliveryDestination: string;
  /** Template or preset this blueprint was adapted from, when any. */
  templateSource?: string;
  /** Assumptions the planner could not resolve. Shown, never silently dropped. */
  openAssumptions: string[];
}

/**
 * Access labels are a FIXED mapping from effective capabilities (architecture.md
 * §7.1). The planner cannot author or override one.
 */
export type AccessLabel =
  | 'read-workspace'
  | 'edit-workspace'
  | 'edit-working-files-directly'
  | 'read-github'
  | 'github-write'
  | 'run-commands'
  | 'reach-internet'
  | 'deployment'
  | 'send-outside-sero'
  | 'other-tools';

export interface AccessSummaryEntry {
  label: AccessLabel;
  /** Set only for the classes the fixed mapping flags. */
  warning?: string;
}

/**
 * The compact proposal. Every authority-bearing field is computed by
 * application code from the validated blueprint; only the four prose fields
 * come from the planner.
 */
export interface RoomProposalSummary {
  // ── computed ────────────────────────────────────────────
  teamSize: number;
  conductorCount: number;
  maxWallClockMs: number;
  maxCostUsd: number;
  access: AccessSummaryEntry[];
  warnings: string[];
  // ── planner prose ───────────────────────────────────────
  title: string;
  approach: string;
  roles: { displayName: string; responsibility: string; isConductor: boolean }[];
  teamRationale: string;
}

/**
 * A member-granular diff of two validated blueprints, computed in application
 * code. The union access tiles are not sufficient on their own: a member can
 * gain a capability another member already holds, which moves no tile while
 * that member's own authority grew. Never planner-authored (D-16).
 */
export interface BlueprintDiff {
  membersAdded: string[];
  membersRemoved: string[];
  memberChanges: MemberDiffEntry[];
  envelopeChanges: EnvelopeDiffEntry[];
  workspaceChanged: boolean;
  deliveryChanged: boolean;
  /** True when nothing authority-bearing moved. */
  authorityUnchanged: boolean;
}

export interface MemberDiffEntry {
  key: string;
  displayName: string;
  toolsAdded: string[];
  toolsRemoved: string[];
  skillsAdded: string[];
  skillsRemoved: string[];
  modelChanged?: { from: string; to: string };
  thinkingChanged?: { from: string; to: string };
  permissionsChanged?: { from: MemberPermissionLevel; to: MemberPermissionLevel };
  worktreeChanged?: { from: boolean; to: boolean };
  /** Conductor status is authority, so a transfer between members is a change. */
  conductorChanged?: { from: boolean; to: boolean };
}

export interface EnvelopeDiffEntry {
  field: keyof OperatingEnvelope;
  from: unknown;
  to: unknown;
}
