/**
 * The fixed, ordered access mapping (architecture.md §7.1, D-15).
 *
 * This table is the ONE source of truth for access labels: the proposal
 * summary, the approval inbox consequence line and the UI tiles all read it.
 * The planner can never author or override a label — it only writes prose.
 *
 * Two ordering rules, both from §7.1:
 *
 * 1. A capability takes the label of the LAST rule it matches. Later rules are
 *    higher-reach and more specific, so `github_write` lands on GitHub write
 *    access rather than on the workspace-edit rule its "write" token also hits.
 * 2. Within a group the highest matching label wins, so a team that reads and
 *    edits shows one workspace tile, not two.
 *
 * A capability no rule matches becomes `other-tools` and is listed in advanced
 * settings. It is never silently dropped (D-15).
 */

import type {
  AccessLabel,
  AccessSummaryEntry,
  BlueprintMember,
  RoomBlueprint,
} from './room-blueprint-types';
import { isDeliveryDestinationId, isExternalDestination } from './delivery-types';

/** Labels in the same group supersede each other; groups are independent. */
export type AccessGroup =
  | 'workspace'
  | 'github'
  | 'commands'
  | 'network'
  | 'deployment'
  | 'delivery'
  | 'other';

/**
 * Inputs that are not capability names but still raise a label: member
 * permissions, the workspace mode and the delivery destination.
 */
export type AccessFact =
  | 'write-permission'
  | 'push-permission'
  | 'worktree-write'
  | 'shared-tree-write'
  | 'external-delivery';

export interface AccessRule {
  label: AccessLabel;
  group: AccessGroup;
  /** Exact capability names, lower case. */
  names: readonly string[];
  /** Substrings of a normalised name. Kept tight — a loose token mislabels authority. */
  tokens: readonly string[];
  /** Non-capability inputs that also raise this label. */
  facts: readonly AccessFact[];
  /** Set only for the classes §7.1 flags. `{destination}` is substituted. */
  warning?: string;
}

/** Evaluated in the order given. Do not reorder without changing §7.1 first. */
export const ROOM_ACCESS_RULES: readonly AccessRule[] = [
  {
    label: 'read-workspace',
    group: 'workspace',
    names: ['read', 'read_file', 'read_files', 'cat', 'ls', 'list_files', 'tree', 'find', 'glob', 'grep', 'ripgrep', 'file_search'],
    tokens: ['grep'],
    facts: [],
  },
  {
    label: 'edit-workspace',
    group: 'workspace',
    names: ['write', 'write_file', 'edit', 'multi_edit', 'str_replace', 'apply_patch', 'create_file', 'delete_file', 'notebook_edit', 'mv', 'rm'],
    tokens: ['write', 'edit', 'patch'],
    facts: ['write-permission', 'worktree-write'],
  },
  {
    label: 'edit-working-files-directly',
    group: 'workspace',
    names: [],
    tokens: [],
    facts: ['shared-tree-write'],
    warning: 'Work is not isolated in a worktree. Members change your working files directly.',
  },
  {
    label: 'read-github',
    group: 'github',
    // `gh` is deliberately absent: the host counts it as push-capable, so it is
    // named on the github-write rule below.
    names: ['github', 'github_cli', 'octokit'],
    tokens: ['github', 'pull_request', 'issue_'],
    facts: [],
  },
  {
    // Kept in step with the host's VCS-write tool group
    // (persistent-sessions/permission-tools.ts). The host grants these only to a
    // member with `vcs: 'push'`, so a Room below `edit-and-push` never receives
    // them. When this table disagreed, the planner offered `git_manager` to an
    // `edit-workspace` team, the proposal promised it, the host removed it at
    // approval, and the session still asked for it — which denied the Conductor
    // its session and paused the whole Room before its first turn.
    //
    // `gh` also lands here rather than on read-GitHub: the host treats it as
    // push-capable, and a label the host will strip is a promise the proposal
    // cannot keep. A later rule wins, so naming it here supersedes read-github.
    label: 'github-write',
    group: 'github',
    names: [
      'gh_pr_create', 'create_pull_request', 'merge_pull_request',
      'gh', 'git_manager', 'git_push', 'create_pr',
    ],
    tokens: ['push', 'merge', 'pr_create', 'create_pull_request'],
    facts: ['push-permission'],
    warning: 'Can push branches and open pull requests.',
  },
  {
    label: 'run-commands',
    group: 'commands',
    names: ['bash', 'sh', 'zsh', 'shell', 'run_command', 'exec', 'terminal', 'process'],
    tokens: ['bash', 'shell', 'exec', 'command', 'terminal'],
    facts: [],
  },
  {
    label: 'reach-internet',
    group: 'network',
    names: ['fetch', 'web_fetch', 'fetch_content', 'web_search', 'get_search_content', 'web_bookmark', 'code_search', 'browser', 'playwright', 'curl'],
    tokens: ['web', 'fetch', 'browser', 'http', 'internet', 'url'],
    facts: [],
  },
  {
    label: 'deployment',
    group: 'deployment',
    names: ['deploy', 'publish', 'release', 'kubectl', 'helm', 'terraform', 'vercel', 'netlify'],
    tokens: ['deploy', 'publish', 'release'],
    facts: [],
    warning: 'Can change live systems.',
  },
  {
    label: 'send-outside-sero',
    group: 'delivery',
    names: [],
    tokens: [],
    facts: ['external-delivery'],
    warning: 'Results leave Sero. They are sent to {destination}.',
  },
  {
    // Reached only by the fallback path in computeAccessSummary.
    label: 'other-tools',
    group: 'other',
    names: [],
    tokens: [],
    facts: [],
  },
];

/**
 * Room mechanics, not reach. The AD-020 bridge is how a member talks to its own
 * Room, every member holds it, and it opens nothing outside the Room — so it is
 * excluded by name rather than shown as an unexplained "other tool".
 */
export const ROOM_PROTOCOL_CAPABILITIES: readonly string[] = ['sero-cli'];

/**
 * One plain-English phrase per label, so a consequence line and a proposal tile
 * always say the same thing about the same authority. Every consequence the
 * user reads is built from this table — a requesting member never writes one.
 */
export const ROOM_ACCESS_LABEL_TEXT: Record<AccessLabel, string> = {
  'read-workspace': 'read your workspace files',
  'edit-workspace': 'change files in its own worktree',
  'edit-working-files-directly': 'change your working files directly',
  'read-github': 'read GitHub issues and pull requests',
  'github-write': 'push branches and open pull requests',
  'run-commands': 'run commands',
  'reach-internet': 'reach the internet',
  deployment: 'change live systems',
  'send-outside-sero': 'send results outside Sero',
  'other-tools': 'use other tools',
};

export interface AccessSummary {
  entries: AccessSummaryEntry[];
  /** Capabilities no rule matched. Always listed in advanced settings. */
  unmapped: string[];
}

/** The last match wins: later rules are the higher-reach, more specific ones. */
function matchingRuleIndex(normalized: string): number {
  return ROOM_ACCESS_RULES.findLastIndex(
    (rule) => rule.names.includes(normalized) || rule.tokens.some((token) => normalized.includes(token)),
  );
}

/** The label one tool or skill carries, or null when no rule matches it. */
export function accessLabelForCapability(name: string): AccessLabel | null {
  const index = matchingRuleIndex(name.trim().toLowerCase());
  return index < 0 ? null : ROOM_ACCESS_RULES[index].label;
}

/** True when this member can change files: by permission, or by holding an edit tool. */
function memberWrites(member: BlueprintMember): boolean {
  if (member.permissions !== 'read-only') return true;
  return [...member.tools, ...member.skills]
    .some((capability) => accessLabelForCapability(capability) === 'edit-workspace');
}

function deriveFacts(blueprint: RoomBlueprint): Set<AccessFact> {
  const facts = new Set<AccessFact>();
  const { members } = blueprint;
  if (members.some((member) => member.permissions !== 'read-only')) facts.add('write-permission');
  if (members.some((member) => member.permissions === 'edit-and-push')) facts.add('push-permission');
  if (members.some((member) => member.needsWorktree && memberWrites(member))) facts.add('worktree-write');
  if (
    blueprint.workspacePolicy.mode === 'shared-working-tree'
    && members.some((member) => !member.needsWorktree && memberWrites(member))
  ) {
    facts.add('shared-tree-write');
  }
  // An unrecognised destination is treated as external: understating reach is
  // the one error this summary must never make.
  const destination = blueprint.deliveryDestination;
  if (!isDeliveryDestinationId(destination) || isExternalDestination(destination)) {
    facts.add('external-delivery');
  }
  return facts;
}

function raiseGroup(winners: Map<AccessGroup, number>, group: AccessGroup, index: number): void {
  const current = winners.get(group);
  if (current === undefined || index > current) winners.set(group, index);
}

/**
 * The access tiles for a whole team: the union of every member's tools, skills
 * and permissions, plus the workspace mode and the delivery destination.
 * Deterministic — the same blueprint always produces the same summary.
 */
export function computeAccessSummary(blueprint: RoomBlueprint): AccessSummary {
  const capabilities = new Map<string, string>();
  for (const member of blueprint.members) {
    for (const capability of [...member.tools, ...member.skills]) {
      const normalized = capability.trim().toLowerCase();
      if (!normalized || ROOM_PROTOCOL_CAPABILITIES.includes(normalized)) continue;
      if (!capabilities.has(normalized)) capabilities.set(normalized, capability);
    }
  }

  const winners = new Map<AccessGroup, number>();
  const unmapped: string[] = [];
  for (const [normalized, original] of capabilities) {
    const index = matchingRuleIndex(normalized);
    if (index < 0) unmapped.push(original);
    else raiseGroup(winners, ROOM_ACCESS_RULES[index].group, index);
  }

  const facts = deriveFacts(blueprint);
  ROOM_ACCESS_RULES.forEach((rule, index) => {
    if (rule.facts.some((fact) => facts.has(fact))) raiseGroup(winners, rule.group, index);
  });

  const shown = new Set(winners.values());
  const entries: AccessSummaryEntry[] = ROOM_ACCESS_RULES
    .filter((_rule, index) => shown.has(index))
    .map((rule) => (
      rule.warning
        ? { label: rule.label, warning: rule.warning.replace('{destination}', blueprint.deliveryDestination) }
        : { label: rule.label }
    ));
  if (unmapped.length > 0) entries.push({ label: 'other-tools' });

  return { entries, unmapped };
}
