/**
 * collaboration-chat-feed — builds a ChatItem[] feed from collaboration
 * store state. Extracted from CollaborationActivityPanel to keep files
 * under 500 LOC.
 */

import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Search as SearchIcon,
  FlaskConical,
  Sparkles,
  Eye,
  Swords,
} from 'lucide-react';
import {
  useFocusedCollaborationPendingUserQuery,
  useFocusedCollaborationSpecialists,
  useFocusedCollaborationStatus,
  useFocusedCollaborationStrategy,
  useFocusedDebateState,
} from '@/stores/agent-selectors';
import type {
  CollaborationRole,
  CollaborationStatus,
  CollaborationStrategy,
  DebateState,
} from '@/types/collaboration';

// ── Chat message types ──────────────────────────────────────────

export type ChatItem =
  | { kind: 'query'; key: string; text: string }
  | { kind: 'phase'; key: string; phase: string }
  | { kind: 'typing'; key: string; role: CollaborationRole }
  | { kind: 'message'; key: string; role: CollaborationRole; text: string; durationMs: number; isError?: boolean }
  | { kind: 'debate-round'; key: string; round: number; challenger: CollaborationRole; defender: CollaborationRole; summary: string; durationMs: number };

export interface ChatFeedInput {
  status: CollaborationStatus;
  strategy: CollaborationStrategy;
  specialists: SpecialistEntry[];
  debate: DebateState | null;
  pendingUserQuery: string | null;
}

// ── Phase banner metadata ───────────────────────────────────────

export const PHASE_BANNERS: Record<
  string,
  {
    icon: LucideIcon;
    label: string;
    color: string;
    surface: string;
    border: string;
  }
> = {
  research: {
    icon: SearchIcon,
    label: 'Research phase started',
    color: 'text-[var(--status-info)]',
    surface: 'bg-[var(--status-info-subtle)]',
    border: 'border-[var(--status-info-border)]',
  },
  specialists: {
    icon: FlaskConical,
    label: 'Specialists are joining...',
    color: 'text-[var(--status-success)]',
    surface: 'bg-[var(--status-success-subtle)]',
    border: 'border-[var(--status-success-border)]',
  },
  synthesis: {
    icon: Sparkles,
    label: 'Synthesizing results...',
    color: 'text-[var(--collab-primary)]',
    surface: 'bg-[var(--collab-primary-subtle)]',
    border: 'border-[var(--collab-primary-border)]',
  },
  decomposition: {
    icon: Eye,
    label: 'Decomposing the problem...',
    color: 'text-[var(--status-info)]',
    surface: 'bg-[var(--status-info-subtle)]',
    border: 'border-[var(--status-info-border)]',
  },
  independent_analysis: {
    icon: FlaskConical,
    label: 'Independent analysis begun',
    color: 'text-[var(--status-success)]',
    surface: 'bg-[var(--status-success-subtle)]',
    border: 'border-[var(--status-success-border)]',
  },
  debate: {
    icon: Swords,
    label: 'Debate phase — let the sparks fly',
    color: 'text-[var(--status-warning)]',
    surface: 'bg-[var(--status-warning-subtle)]',
    border: 'border-[var(--status-warning-border)]',
  },
};

// ── Hook: build the chat feed ───────────────────────────────────

export function useChatFeed(): ChatItem[] {
  const status = useFocusedCollaborationStatus();
  const strategy = useFocusedCollaborationStrategy();
  const specialists = useFocusedCollaborationSpecialists();
  const debate = useFocusedDebateState();
  const pendingUserQuery = useFocusedCollaborationPendingUserQuery();

  return useMemo(
    () =>
      buildChatFeed({
        status,
        strategy,
        specialists,
        debate,
        pendingUserQuery,
      }),
    [status, strategy, specialists, debate, pendingUserQuery],
  );
}

export function buildChatFeed({
  status,
  strategy,
  specialists,
  debate,
  pendingUserQuery,
}: ChatFeedInput): ChatItem[] {
  const items: ChatItem[] = [];

  if (shouldRenderPendingQuery(status, pendingUserQuery)) {
    items.push({
      kind: 'query',
      key: 'pending-query',
      text: pendingUserQuery!.trim(),
    });
  }

  if (strategy === 'debate' && debate) {
    return buildDebateFeed(debate, specialists, items);
  }

  return buildStandardFeed(status, specialists, items);
}

function shouldRenderPendingQuery(
  status: CollaborationStatus,
  pendingUserQuery: string | null,
): boolean {
  if (!pendingUserQuery?.trim()) return false;
  return status !== 'idle' && status !== 'complete';
}

// ── Standard strategy feed builder ──────────────────────────────

type SpecialistEntry = {
  role: CollaborationRole;
  response: string;
  error?: string;
  durationMs: number;
};

function buildStandardFeed(
  status: CollaborationStatus,
  specialists: SpecialistEntry[],
  items: ChatItem[],
): ChatItem[] {
  items.push({ kind: 'phase', key: 'phase-research', phase: 'research' });

  const completedRoles = new Set(specialists.map((s) => s.role));

  const researcher = specialists.find((s) => s.role === 'researcher');
  if (researcher) {
    items.push({ kind: 'message', key: 'msg-researcher', role: 'researcher', text: researcher.response, durationMs: researcher.durationMs, isError: !!researcher.error });
  } else if (status === 'research') {
    items.push({ kind: 'typing', key: 'typing-researcher', role: 'researcher' });
  }

  if (status === 'specialists' || status === 'synthesis' || completedRoles.has('analyst') || completedRoles.has('visionary')) {
    items.push({ kind: 'phase', key: 'phase-specialists', phase: 'specialists' });
  }

  for (const role of ['analyst', 'visionary'] as CollaborationRole[]) {
    const spec = specialists.find((s) => s.role === role);
    if (spec) {
      items.push({ kind: 'message', key: `msg-${role}`, role, text: spec.response, durationMs: spec.durationMs, isError: !!spec.error });
    } else if (status === 'specialists') {
      items.push({ kind: 'typing', key: `typing-${role}`, role });
    }
  }

  if (status === 'synthesis' || completedRoles.has('coordinator')) {
    items.push({ kind: 'phase', key: 'phase-synthesis', phase: 'synthesis' });
  }

  const coordinator = specialists.find((s) => s.role === 'coordinator');
  if (coordinator) {
    items.push({ kind: 'message', key: 'msg-coordinator', role: 'coordinator', text: coordinator.response, durationMs: coordinator.durationMs, isError: !!coordinator.error });
  } else if (status === 'synthesis') {
    items.push({ kind: 'typing', key: 'typing-coordinator', role: 'coordinator' });
  }

  return items;
}

// ── Debate strategy feed builder ────────────────────────────────

function buildDebateFeed(
  debate: NonNullable<ReturnType<typeof useFocusedDebateState>>,
  specialists: SpecialistEntry[],
  items: ChatItem[],
): ChatItem[] {
  const phases: string[] = ['decomposition', 'independent_analysis', 'debate', 'synthesis'];
  const currentIdx = phases.indexOf(debate.phase);

  for (let i = 0; i <= currentIdx; i++) {
    items.push({ kind: 'phase', key: `phase-${phases[i]}`, phase: phases[i]! });

    if (phases[i] === 'decomposition') {
      const decomposition = specialists.find((s) => s.role === 'coordinator');
      const coordinatorStatus =
        debate.agentStatuses.coordinator ?? debate.agentStatuses['collab-coordinator'];
      if (decomposition) {
        items.push({
          kind: 'message',
          key: 'msg-decomposition-coordinator',
          role: 'coordinator',
          text: decomposition.response,
          durationMs: decomposition.durationMs,
          isError: !!decomposition.error,
        });
      } else if (i === currentIdx && coordinatorStatus === 'running') {
        items.push({ kind: 'typing', key: 'typing-decomposition-coordinator', role: 'coordinator' });
      }
    }

    if (phases[i] === 'independent_analysis') {
      for (const role of ['researcher', 'analyst', 'visionary'] as CollaborationRole[]) {
        const spec = specialists.find((s) => s.role === role);
        const agentName = role === 'analyst' ? 'collab-analyst' : role;
        const agentStatus = debate.agentStatuses[agentName];
        if (spec) {
          items.push({ kind: 'message', key: `msg-${role}`, role, text: spec.response, durationMs: spec.durationMs, isError: !!spec.error });
        } else if (agentStatus === 'running') {
          items.push({ kind: 'typing', key: `typing-${role}`, role });
        }
      }
    }

    if (phases[i] === 'debate') {
      for (const round of debate.rounds) {
        items.push({
          kind: 'debate-round',
          key: `debate-r${round.roundNumber}`,
          round: round.roundNumber,
          challenger: round.challengerRole,
          defender: round.defenderRole,
          summary: round.summary,
          durationMs: round.durationMs,
        });
      }
      if (i === currentIdx && debate.currentRound > debate.rounds.length) {
        const activeAgents = Object.entries(debate.agentStatuses).filter(([, status]) => status === 'running');
        for (const [name] of activeAgents) {
          const role = agentNameToRole(name);
          if (role) items.push({ kind: 'typing', key: `typing-debate-${role}`, role });
        }
      }
    }

    if (phases[i] === 'synthesis' && i === currentIdx) {
      items.push({ kind: 'typing', key: 'typing-coordinator', role: 'coordinator' });
    }
  }

  return items;
}

function agentNameToRole(name: string): CollaborationRole | null {
  if (name === 'collab-analyst' || name === 'analyst') return 'analyst';
  if (name === 'researcher' || name === 'collab-researcher') return 'researcher';
  if (name === 'visionary' || name === 'collab-visionary') return 'visionary';
  if (name === 'coordinator' || name === 'collab-coordinator') return 'coordinator';
  return null;
}
