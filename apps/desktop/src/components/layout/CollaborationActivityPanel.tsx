/**
 * CollaborationActivityPanel — rich stage-based progress visualization
 * for collaboration mode (both standard and debate strategies).
 *
 * Inspired by the kanban ImplementationActivityPanel pattern: shows a
 * step pipeline with phase indicators, agent status pills, elapsed timer,
 * and debate round progress when using the debate strategy.
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Search,
  BarChart3,
  Lightbulb,
  Users,
  Swords,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  useFocusedCollaborationStatus,
  useFocusedCollaborationSpecialists,
  useFocusedCollaborationStrategy,
  useFocusedDebateState,
} from '@/stores/agent-selectors';
import { cn } from '@sero/ui/lib/utils';
import type { CollaborationRole, CollaborationStatus, DebatePhase } from '@/types/collaboration';
import { DEBATE_PHASE_LABELS } from '@/types/collaboration';
import { useElapsedTimer } from './useCollaborationTimer';

// ── Standard strategy steps ─────────────────────────────────────

interface StepDef {
  label: string;
  phase: CollaborationStatus;
}

const STANDARD_STEPS: StepDef[] = [
  { label: 'Research', phase: 'research' },
  { label: 'Specialists', phase: 'specialists' },
  { label: 'Synthesis', phase: 'synthesis' },
];

// ── Debate strategy steps ───────────────────────────────────────

interface DebateStepDef {
  label: string;
  phase: DebatePhase;
}

const DEBATE_STEPS: DebateStepDef[] = [
  { label: 'Decompose', phase: 'decomposition' },
  { label: 'Analyze', phase: 'independent_analysis' },
  { label: 'Debate', phase: 'debate' },
  { label: 'Synthesize', phase: 'synthesis' },
];

// ── Role metadata ───────────────────────────────────────────────

const ROLE_META: Record<CollaborationRole, { label: string; icon: typeof Search; color: string; bg: string }> = {
  coordinator: { label: 'Coordinator', icon: Users, color: 'text-[var(--collab-primary)]', bg: 'bg-[var(--collab-primary-subtle)]' },
  researcher: { label: 'Researcher', icon: Search, color: 'text-[var(--status-info)]', bg: 'bg-[var(--status-info-subtle)]' },
  analyst: { label: 'Analyst', icon: BarChart3, color: 'text-[var(--status-success)]', bg: 'bg-[var(--status-success-subtle)]' },
  visionary: { label: 'Visionary', icon: Lightbulb, color: 'text-[var(--status-warning)]', bg: 'bg-[var(--status-warning-subtle)]' },
};

// ── Step pipeline (shared between strategies) ───────────────────

type StepState = 'done' | 'active' | 'pending';

function StepDot({ state, index }: { state: StepState; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.08, duration: 0.2 }}
      className={cn(
        'flex size-5 items-center justify-center rounded-full text-[9px] font-bold',
        state === 'done' && 'bg-[var(--status-success-border)] text-[var(--status-success)]',
        state === 'active' && 'bg-[var(--collab-primary-border)] text-[var(--collab-primary)]',
        state === 'pending' && 'bg-[var(--bg-elevated)] text-[var(--text-muted)]',
      )}
    >
      {state === 'done' ? (
        <CheckCircle2 className="size-3" />
      ) : state === 'active' ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <span>{index + 1}</span>
      )}
    </motion.div>
  );
}

function StepLine({ state }: { state: 'done' | 'pending' }) {
  return (
    <div
      className={cn(
        'h-[2px] flex-1 rounded transition-colors duration-300',
        state === 'done' ? 'bg-[var(--status-success-border)]' : 'bg-[var(--border-default)]',
      )}
    />
  );
}

function StepPipeline<T extends { label: string }>({
  steps,
  activeIndex,
}: {
  steps: T[];
  activeIndex: number;
}) {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      {steps.map((step, i) => {
        const state: StepState = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending';
        return (
          <div key={step.label} className="contents">
            <div className="flex shrink-0 flex-col items-center gap-0.5">
              <StepDot state={state} index={i} />
              <span
                className={cn(
                  'text-[9px] whitespace-nowrap',
                  state === 'active' ? 'font-medium text-[var(--collab-primary)]' : 'text-[var(--text-muted)]',
                )}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <StepLine state={i < activeIndex ? 'done' : 'pending'} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Agent pills ─────────────────────────────────────────────────

function AgentPill({ role, status }: { role: CollaborationRole; status: 'pending' | 'running' | 'completed' | 'failed' }) {
  const meta = ROLE_META[role];
  const Icon = meta.icon;

  return (
    <div
      className={cn(
        'flex flex-1 items-center justify-center gap-1 rounded-full px-2 py-0.5 text-[10px]',
        status === 'running' && `${meta.bg} ${meta.color}`,
        status === 'completed' && 'bg-[var(--status-success-muted)] text-[var(--status-success)]',
        status === 'failed' && 'bg-destructive/10 text-destructive',
        status === 'pending' && 'bg-[var(--bg-elevated)] text-[var(--text-muted)]',
      )}
    >
      {status === 'running' ? (
        <Loader2 className="size-2.5 animate-spin" />
      ) : status === 'completed' ? (
        <CheckCircle2 className="size-2.5" />
      ) : status === 'failed' ? (
        <XCircle className="size-2.5" />
      ) : (
        <Icon className="size-2.5" />
      )}
      <span>{meta.label}</span>
    </div>
  );
}

// ── Debate rounds feed ──────────────────────────────────────────

function DebateRoundsFeed() {
  const debate = useFocusedDebateState();
  const [expanded, setExpanded] = useState(false);

  if (!debate || debate.rounds.length === 0) return null;

  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div className="border-t border-[var(--border-default)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
      >
        <Chevron className="size-2.5" />
        <Swords className="size-2.5 text-[var(--status-warning)]" />
        <span>{debate.rounds.length} debate round{debate.rounds.length !== 1 ? 's' : ''}</span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 px-3 pb-3">
              {debate.rounds.map((round) => (
                <div
                  key={round.roundNumber}
                  className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] px-3 py-2"
                >
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-semibold text-[var(--status-warning)]">R{round.roundNumber}</span>
                    <span className="text-[var(--text-muted)]">
                      {ROLE_META[round.challengerRole].label} challenges {ROLE_META[round.defenderRole].label}
                    </span>
                    <span className="ml-auto shrink-0 text-[var(--text-muted)]">
                      {Math.round(round.durationMs / 1000)}s
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                    {round.summary}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Standard strategy panel ─────────────────────────────────────

function StandardActivityContent() {
  const status = useFocusedCollaborationStatus();
  const specialists = useFocusedCollaborationSpecialists();

  const activeIndex = useMemo(() => {
    switch (status) {
      case 'research': return 0;
      case 'specialists': return 1;
      case 'synthesis': return 2;
      case 'complete': return 3;
      default: return 0;
    }
  }, [status]);

  const agentStatuses = useMemo(() => {
    const completedRoles = new Set(specialists.map((s) => s.role));
    const roles: CollaborationRole[] = ['researcher', 'analyst', 'visionary', 'coordinator'];
    return roles.map((role) => ({
      role,
      status: completedRoles.has(role)
        ? ('completed' as const)
        : (status === 'research' && role === 'researcher') ||
          (status === 'specialists' && (role === 'analyst' || role === 'visionary')) ||
          (status === 'synthesis' && role === 'coordinator')
          ? ('running' as const)
          : ('pending' as const),
    }));
  }, [status, specialists]);

  return (
    <>
      <StepPipeline steps={STANDARD_STEPS} activeIndex={activeIndex} />
      <div className="flex flex-wrap gap-1.5 px-3 pb-2">
        {agentStatuses.map(({ role, status: s }) => (
          <AgentPill key={role} role={role} status={s} />
        ))}
      </div>
    </>
  );
}

// ── Debate strategy panel ───────────────────────────────────────

function DebateActivityContent() {
  const debate = useFocusedDebateState();
  const specialists = useFocusedCollaborationSpecialists();

  const activeIndex = useMemo(() => {
    if (!debate) return 0;
    switch (debate.phase) {
      case 'decomposition': return 0;
      case 'independent_analysis': return 1;
      case 'debate': return 2;
      case 'synthesis': return 3;
      default: return 0;
    }
  }, [debate]);

  const agentStatuses = useMemo(() => {
    if (!debate) return [];
    const roles: CollaborationRole[] = ['coordinator', 'researcher', 'analyst', 'visionary'];
    const completedRoles = new Set(specialists.map((s) => s.role));
    return roles.map((role) => {
      const agentName = role === 'analyst' ? 'collab-analyst' : role;
      const fromDebate = debate.agentStatuses[agentName];
      if (fromDebate) return { role, status: fromDebate };
      if (completedRoles.has(role)) return { role, status: 'completed' as const };
      return { role, status: 'pending' as const };
    });
  }, [debate, specialists]);

  const phaseLabel = debate ? DEBATE_PHASE_LABELS[debate.phase] : 'Starting...';

  return (
    <>
      <StepPipeline steps={DEBATE_STEPS} activeIndex={activeIndex} />

      {/* Phase label */}
      <div className="flex items-center gap-2 px-3 pb-1">
        <span className="text-[10px] font-medium text-[var(--collab-primary)]">{phaseLabel}</span>
        {debate && debate.phase === 'debate' && debate.totalRounds > 0 && (
          <DebateRoundIndicator
            currentRound={debate.currentRound}
            totalRounds={debate.totalRounds}
          />
        )}
      </div>

      {/* Agent pills */}
      <div className="flex flex-wrap gap-1.5 px-3 pb-2">
        {agentStatuses.map(({ role, status }) => (
          <AgentPill key={role} role={role} status={status} />
        ))}
      </div>

      {/* Debate rounds feed */}
      <DebateRoundsFeed />
    </>
  );
}

function DebateRoundIndicator({
  currentRound,
  totalRounds,
}: {
  currentRound: number;
  totalRounds: number;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: totalRounds }, (_, i) => (
        <div
          key={i}
          className={cn(
            'h-[3px] w-4 rounded-sm transition-colors duration-300',
            i + 1 < currentRound
              ? 'bg-[var(--status-success)]'
              : i + 1 === currentRound
                ? 'bg-[var(--status-warning)]'
                : 'bg-[var(--bg-elevated)]',
          )}
        />
      ))}
      <span className="ml-1 text-[9px] text-[var(--text-muted)]">
        {currentRound}/{totalRounds}
      </span>
    </div>
  );
}

// ── Main panel ──────────────────────────────────────────────────

export function CollaborationActivityPanel() {
  const status = useFocusedCollaborationStatus();
  const strategy = useFocusedCollaborationStrategy();

  if (status === 'idle' || status === 'complete') return null;

  return (
    <div className="mx-3 mb-2 flex max-h-80 flex-col overflow-hidden rounded-md border border-[var(--collab-primary-border)] bg-[var(--collab-primary-muted)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <div className="size-1.5 animate-pulse rounded-full bg-[var(--collab-primary)]" />
        <span className="text-[11px] font-medium text-[var(--collab-primary)]">
          {strategy === 'debate' ? 'Debate Collaboration' : '4-Agent Collaboration'}
        </span>
        <ElapsedTimer />
      </div>

      {/* Strategy-specific content — scrollable when debate feed overflows */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        {strategy === 'debate' ? <DebateActivityContent /> : <StandardActivityContent />}
      </div>

      {/* Error indicator */}
      {status === 'error' && (
        <div className="flex items-center gap-1.5 border-t border-destructive/20 bg-destructive/5 px-3 py-1.5">
          <XCircle className="size-3 text-destructive" />
          <span className="text-[10px] text-destructive">An error occurred during collaboration</span>
        </div>
      )}
    </div>
  );
}

function ElapsedTimer() {
  const status = useFocusedCollaborationStatus();
  const elapsed = useElapsedTimer(status !== 'idle' && status !== 'complete' && status !== 'error');

  if (elapsed === 0) return null;

  const formatted = elapsed < 60
    ? `${elapsed}s`
    : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;

  return (
    <span className="ml-auto text-[10px] tabular-nums text-[var(--text-muted)]">
      {formatted}
    </span>
  );
}
