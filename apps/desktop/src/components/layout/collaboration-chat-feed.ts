/**
 * collaboration-chat-feed — builds a ChatItem[] feed from collaboration
 * store state. Extracted from CollaborationActivityPanel to keep files
 * under 500 LOC.
 */

import { useMemo } from 'react';
import type { Search } from 'lucide-react';
import {
  Search as SearchIcon,
  FlaskConical,
  Sparkles,
  Eye,
  Swords,
} from 'lucide-react';
import {
  useFocusedCollaborationStatus,
  useFocusedCollaborationSpecialists,
  useFocusedCollaborationStrategy,
  useFocusedDebateState,
} from '@/stores/agent-selectors';
import type { CollaborationRole, CollaborationStatus } from '@/types/collaboration';

// ── Chat message types ──────────────────────────────────────────

export type ChatItem =
  | { kind: 'phase'; key: string; phase: string }
  | { kind: 'typing'; key: string; role: CollaborationRole }
  | { kind: 'message'; key: string; role: CollaborationRole; text: string; durationMs: number; isError?: boolean }
  | { kind: 'debate-round'; key: string; round: number; challenger: CollaborationRole; defender: CollaborationRole; summary: string; durationMs: number };

// ── Phase banner metadata ───────────────────────────────────────

export const PHASE_BANNERS: Record<string, { icon: typeof Search; label: string; color: string }> = {
  research: { icon: SearchIcon, label: 'Research phase started', color: 'text-[var(--status-info)]' },
  specialists: { icon: FlaskConical, label: 'Specialists are joining...', color: 'text-[var(--status-success)]' },
  synthesis: { icon: Sparkles, label: 'Synthesizing results...', color: 'text-[var(--collab-primary)]' },
  decomposition: { icon: Eye, label: 'Decomposing the problem...', color: 'text-[var(--status-info)]' },
  independent_analysis: { icon: FlaskConical, label: 'Independent analysis begun', color: 'text-[var(--status-success)]' },
  debate: { icon: Swords, label: 'Debate phase — let the sparks fly', color: 'text-[var(--status-warning)]' },
};

// ── Hook: build the chat feed ───────────────────────────────────

export function useChatFeed(): ChatItem[] {
  const status = useFocusedCollaborationStatus();
  const strategy = useFocusedCollaborationStrategy();
  const specialists = useFocusedCollaborationSpecialists();
  const debate = useFocusedDebateState();

  return useMemo(() => {
    const items: ChatItem[] = [];

    if (strategy === 'debate' && debate) {
      return buildDebateFeed(debate, specialists, items);
    }

    return buildStandardFeed(status, specialists, items);
  }, [status, strategy, specialists, debate]);
}

// ── Standard strategy feed builder ──────────────────────────────

type SpecialistEntry = { role: CollaborationRole; response: string; error?: string; durationMs: number };

function buildStandardFeed(
  status: CollaborationStatus,
  specialists: SpecialistEntry[],
  items: ChatItem[],
): ChatItem[] {
  items.push({ kind: 'phase', key: 'phase-research', phase: 'research' });

  const completedRoles = new Set(specialists.map((s) => s.role));

  // Researcher
  const researcher = specialists.find((s) => s.role === 'researcher');
  if (researcher) {
    items.push({ kind: 'message', key: 'msg-researcher', role: 'researcher', text: researcher.response, durationMs: researcher.durationMs, isError: !!researcher.error });
  } else if (status === 'research') {
    items.push({ kind: 'typing', key: 'typing-researcher', role: 'researcher' });
  }

  if (status === 'specialists' || status === 'synthesis' || completedRoles.has('analyst') || completedRoles.has('visionary')) {
    items.push({ kind: 'phase', key: 'phase-specialists', phase: 'specialists' });
  }

  // Analyst & Visionary
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

  // Coordinator
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
        const activeAgents = Object.entries(debate.agentStatuses).filter(([, s]) => s === 'running');
        for (const [name] of activeAgents) {
          const role = agentNameToRole(name);
          if (role) items.push({ kind: 'typing', key: `typing-debate-${role}`, role });
        }
      }
    }

    if (phases[i] === 'synthesis') {
      const coordinator = specialists.find((s) => s.role === 'coordinator');
      if (coordinator) {
        items.push({ kind: 'message', key: 'msg-coordinator', role: 'coordinator', text: coordinator.response, durationMs: coordinator.durationMs });
      } else if (i === currentIdx) {
        items.push({ kind: 'typing', key: 'typing-coordinator', role: 'coordinator' });
      }
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
