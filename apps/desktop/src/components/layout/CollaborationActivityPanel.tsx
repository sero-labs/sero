/**
 * CollaborationActivityPanel — "Group Chat" style visualization
 * that makes multi-agent collaboration feel like eavesdropping on
 * a lively team chat room. Each agent has a distinct avatar, color,
 * and personality. Messages appear as chat bubbles with typing
 * indicators, reactions, and phase banners.
 */

import { useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2,
  XCircle,
  Search,
  BarChart3,
  Lightbulb,
  Users,
  Swords,
  Zap,
} from 'lucide-react';
import { useFocusedCollaborationStatus, useFocusedCollaborationStrategy } from '@/stores/agent-selectors';
import { cn } from '@sero-ai/ui/lib/utils';
import type { CollaborationRole } from '@/types/collaboration';
import { useElapsedTimer } from './useCollaborationTimer';
import { useChatFeed, PHASE_BANNERS } from './collaboration-chat-feed';

// ── Agent identities ────────────────────────────────────────────

interface AgentIdentity {
  label: string;
  emoji: string;
  icon: typeof Search;
  color: string;
  bg: string;
  border: string;
  statusVerb: string;
}

const AGENTS: Record<CollaborationRole, AgentIdentity> = {
  coordinator: {
    label: 'Coordinator',
    emoji: '🎯',
    icon: Users,
    color: 'text-[var(--collab-primary)]',
    bg: 'bg-[var(--collab-primary-subtle)]',
    border: 'border-[var(--collab-primary-border)]',
    statusVerb: 'Orchestrating',
  },
  researcher: {
    label: 'Researcher',
    emoji: '🔍',
    icon: Search,
    color: 'text-[var(--status-info)]',
    bg: 'bg-[var(--status-info-subtle)]',
    border: 'border-[var(--status-info-border)]',
    statusVerb: 'Investigating',
  },
  analyst: {
    label: 'Analyst',
    emoji: '📊',
    icon: BarChart3,
    color: 'text-[var(--status-success)]',
    bg: 'bg-[var(--status-success-subtle)]',
    border: 'border-[var(--status-success-border)]',
    statusVerb: 'Crunching data',
  },
  visionary: {
    label: 'Visionary',
    emoji: '💡',
    icon: Lightbulb,
    color: 'text-[var(--status-warning)]',
    bg: 'bg-[var(--status-warning-subtle)]',
    border: 'border-[var(--status-warning-border)]',
    statusVerb: 'Brainstorming',
  },
};

// ── Avatar component ────────────────────────────────────────────

function AgentAvatar({ role, size = 'md', pulse }: { role: CollaborationRole; size?: 'sm' | 'md'; pulse?: boolean }) {
  const agent = AGENTS[role];
  const sizeClass = size === 'sm' ? 'size-5 text-[10px]' : 'size-7 text-sm';

  return (
    <div className={cn('relative shrink-0 select-none rounded-full flex items-center justify-center', sizeClass, agent.bg, agent.border, 'border')}>
      <span>{agent.emoji}</span>
      {pulse && (
        <span className={cn('absolute -bottom-0.5 -right-0.5 size-2 rounded-full border border-[var(--bg-surface)]', 'bg-[var(--status-success)] animate-pulse')} />
      )}
    </div>
  );
}

// ── Typing indicator (bouncing dots) ────────────────────────────

function TypingBubble({ role }: { role: CollaborationRole }) {
  const agent = AGENTS[role];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className="flex items-end gap-2 px-3"
    >
      <AgentAvatar role={role} pulse />
      <div className="flex flex-col gap-0.5">
        <span className={cn('text-[9px] font-medium pl-1', agent.color)}>{agent.label}</span>
        <div className={cn('flex items-center gap-1 rounded-2xl rounded-bl-sm px-3 py-2 border', agent.bg, agent.border)}>
          <span className={cn('text-[10px] italic', agent.color)}>{agent.statusVerb}</span>
          <span className="flex gap-0.5 ml-1">
            {[0, 1, 2].map((i) => (
              <motion.span
                key={i}
                className={cn('size-1 rounded-full', agent.color.replace('text-', 'bg-'))}
                animate={{ y: [0, -3, 0] }}
                transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.15, ease: 'easeInOut' }}
              />
            ))}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ── Chat message bubble ─────────────────────────────────────────

function MessageBubble({ role, text, durationMs, isError }: {
  role: CollaborationRole;
  text: string;
  durationMs: number;
  isError?: boolean;
}) {
  const agent = AGENTS[role];
  const [expanded, setExpanded] = useState(false);

  const truncateLen = 180;
  const isLong = text.length > truncateLen;
  const displayText = expanded ? text : isLong ? text.slice(0, truncateLen) + '...' : text;
  const duration = durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      className="flex items-start gap-2 px-3"
    >
      <AgentAvatar role={role} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className={cn('text-[9px] font-semibold', agent.color)}>{agent.label}</span>
          <span className="text-[8px] text-[var(--text-muted)] tabular-nums">{duration}</span>
          {isError ? <XCircle className="size-2.5 text-destructive" /> : <CheckCircle2 className="size-2.5 text-[var(--status-success)]" />}
        </div>
        <div
          className={cn(
            'rounded-2xl rounded-tl-sm border px-3 py-2 text-[11px] leading-relaxed text-[var(--text-secondary)]',
            isError ? 'border-destructive/20 bg-destructive/5' : `${agent.bg} ${agent.border}`,
          )}
        >
          <p className="whitespace-pre-wrap break-words">{displayText}</p>
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              className={cn('mt-1 text-[10px] font-medium', agent.color, 'hover:underline')}
            >
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Debate round card ───────────────────────────────────────────

function DebateRoundBubble({ round, challenger, defender, summary, durationMs }: {
  round: number;
  challenger: CollaborationRole;
  defender: CollaborationRole;
  summary: string;
  durationMs: number;
}) {
  const duration = durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      className="mx-3 flex flex-col gap-1.5 rounded-xl border border-[var(--status-warning-border)] bg-[var(--status-warning-faint)] p-3"
    >
      <div className="flex items-center gap-2">
        <Swords className="size-3 text-[var(--status-warning)]" />
        <span className="text-[10px] font-bold text-[var(--status-warning)]">Round {round}</span>
        <div className="flex items-center gap-1 ml-1">
          <AgentAvatar role={challenger} size="sm" />
          <Zap className="size-2.5 text-[var(--status-warning)]" />
          <AgentAvatar role={defender} size="sm" />
        </div>
        <span className="ml-auto text-[8px] tabular-nums text-[var(--text-muted)]">{duration}</span>
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">{summary}</p>
    </motion.div>
  );
}

// ── Phase banner ────────────────────────────────────────────────

function PhaseBanner({ phase }: { phase: string }) {
  const config = PHASE_BANNERS[phase];
  if (!config) return null;
  const Icon = config.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className="flex items-center gap-2 px-4 py-1"
    >
      <div className="h-px flex-1 bg-[var(--border-default)]" />
      <div className="flex items-center gap-1.5">
        <Icon className={cn('size-2.5', config.color)} />
        <span className={cn('text-[9px] font-semibold uppercase tracking-wider', config.color)}>
          {config.label}
        </span>
      </div>
      <div className="h-px flex-1 bg-[var(--border-default)]" />
    </motion.div>
  );
}

// ── Elapsed timer ───────────────────────────────────────────────

function ElapsedTimer() {
  const status = useFocusedCollaborationStatus();
  const elapsed = useElapsedTimer(status !== 'idle' && status !== 'complete' && status !== 'error');

  if (elapsed === 0) return null;

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <span className="ml-auto flex items-center gap-1 text-[10px] tabular-nums text-[var(--text-muted)]">
      <span className="size-1.5 rounded-full bg-[var(--status-success)] animate-pulse" />
      {mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}
    </span>
  );
}

// ── Online roster (who's "in the room") ─────────────────────────

function OnlineRoster({ activeRoles }: { activeRoles: Set<CollaborationRole> }) {
  const allRoles: CollaborationRole[] = ['coordinator', 'researcher', 'analyst', 'visionary'];

  return (
    <div className="flex items-center gap-1">
      {allRoles.map((role) => {
        const agent = AGENTS[role];
        const isActive = activeRoles.has(role);
        return (
          <motion.div
            key={role}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: isActive ? 1 : 0.35, scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className={cn(
              'flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] border transition-all duration-300',
              isActive ? `${agent.bg} ${agent.border} ${agent.color}` : 'bg-transparent border-transparent text-[var(--text-muted)]',
            )}
            title={agent.label}
          >
            <span className="text-[10px]">{agent.emoji}</span>
            {isActive && <span className="font-medium">{agent.label}</span>}
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Auto-scroll helper ──────────────────────────────────────────

function useAutoScroll(feedLen: number) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  const prevLen = useRef(0);
  if (feedLen !== prevLen.current) {
    prevLen.current = feedLen;
    requestAnimationFrame(() => scrollToBottom());
  }

  return scrollRef;
}

// ── Main panel ──────────────────────────────────────────────────

export function CollaborationActivityPanel() {
  const status = useFocusedCollaborationStatus();
  const strategy = useFocusedCollaborationStrategy();
  const feed = useChatFeed();
  const scrollRef = useAutoScroll(feed.length);

  if (status === 'idle' || status === 'complete') return null;

  // Determine who's "online" (active or completed)
  const activeRoles = useMemo(() => {
    const roles = new Set<CollaborationRole>();
    for (const item of feed) {
      if (item.kind === 'typing' || item.kind === 'message') roles.add(item.role);
      if (item.kind === 'debate-round') { roles.add(item.challenger); roles.add(item.defender); }
    }
    return roles;
  }, [feed]);

  const chatTitle = strategy === 'debate' ? '⚔️ Debate Room' : '💬 Agent Chat';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="mx-3 mb-2 flex max-h-80 flex-col overflow-hidden rounded-xl border border-[var(--collab-primary-border)] bg-[var(--bg-surface)]"
    >
      {/* Header — chat room title bar */}
      <div className="flex items-center gap-2 border-b border-[var(--border-default)] bg-gradient-to-r from-[var(--collab-primary-muted)] to-transparent px-3 py-1.5">
        <span className="text-[11px] font-semibold text-[var(--collab-primary)]">{chatTitle}</span>
        <OnlineRoster activeRoles={activeRoles} />
        <ElapsedTimer />
      </div>

      {/* Chat feed — scrollable */}
      <div ref={scrollRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto py-2">
        <AnimatePresence mode="popLayout">
          {feed.map((item) => {
            switch (item.kind) {
              case 'phase':
                return <PhaseBanner key={item.key} phase={item.phase} />;
              case 'typing':
                return <TypingBubble key={item.key} role={item.role} />;
              case 'message':
                return <MessageBubble key={item.key} role={item.role} text={item.text} durationMs={item.durationMs} isError={item.isError} />;
              case 'debate-round':
                return <DebateRoundBubble key={item.key} round={item.round} challenger={item.challenger} defender={item.defender} summary={item.summary} durationMs={item.durationMs} />;
            }
          })}
        </AnimatePresence>
      </div>

      {/* Error footer */}
      {status === 'error' && (
        <div className="flex items-center gap-1.5 border-t border-destructive/20 bg-destructive/5 px-3 py-1.5">
          <XCircle className="size-3 text-destructive" />
          <span className="text-[10px] text-destructive">Connection lost — an error occurred</span>
        </div>
      )}
    </motion.div>
  );
}
