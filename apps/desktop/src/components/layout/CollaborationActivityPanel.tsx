/**
 * CollaborationActivityPanel — "Group Chat" style visualization
 * that makes multi-agent collaboration feel like eavesdropping on
 * a lively team chat room. Each agent has a distinct icon, color,
 * and personality. Messages appear as chat bubbles with typing
 * indicators, reactions, and phase banners.
 */

import { useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  CheckCircle2,
  Clock3,
  Swords,
  Users,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  useFocusedCollaborationStatus,
  useFocusedCollaborationStrategy,
} from '@/stores/agent-selectors';
import { cn } from '@sero-ai/ui/lib/utils';
import type { CollaborationRole } from '@/types/collaboration';
import { useElapsedTimer } from './useCollaborationTimer';
import { useChatFeed, PHASE_BANNERS } from './collaboration-chat-feed';
import {
  COLLABORATION_ROLE_VISUALS,
  CollaborationRoleBadge,
} from './collaboration-visuals';

// ── Typing indicator (bouncing dots) ────────────────────────────

function TypingDots({ colorClass }: { colorClass: string }) {
  return (
    <span className={cn('ml-1 flex gap-0.5', colorClass)}>
      {[0, 1, 2].map((index) => (
        <motion.span
          key={index}
          className="size-1 rounded-full"
          style={{ backgroundColor: 'currentColor' }}
          animate={{ y: [0, -3, 0] }}
          transition={{
            duration: 0.5,
            repeat: Infinity,
            delay: index * 0.15,
            ease: 'easeInOut',
          }}
        />
      ))}
    </span>
  );
}

function TypingBubble({ role }: { role: CollaborationRole }) {
  const visual = COLLABORATION_ROLE_VISUALS[role];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className="flex items-end gap-2 px-2"
    >
      <CollaborationRoleBadge role={role} pulse />
      <div className="flex min-w-0 flex-col gap-1">
        <span className={cn('pl-1 text-[10px] font-semibold', visual.color)}>
          {visual.label}
        </span>
        <div
          className={cn(
            'flex items-center gap-1.5 rounded-2xl rounded-bl-md border px-3 py-2',
            visual.surface,
            visual.border,
          )}
        >
          <span className={cn('text-[11px] italic', visual.color)}>
            {visual.statusVerb}
          </span>
          <TypingDots colorClass={visual.color} />
        </div>
      </div>
    </motion.div>
  );
}

// ── Chat message bubble ─────────────────────────────────────────

function MessageBubble({
  role,
  text,
  durationMs,
  isError,
}: {
  role: CollaborationRole;
  text: string;
  durationMs: number;
  isError?: boolean;
}) {
  const visual = COLLABORATION_ROLE_VISUALS[role];
  const [expanded, setExpanded] = useState(false);

  const truncateLen = 180;
  const isLong = text.length > truncateLen;
  const displayText = expanded ? text : isLong ? `${text.slice(0, truncateLen)}...` : text;
  const duration =
    durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      className="flex items-start gap-2 px-2"
    >
      <CollaborationRoleBadge role={role} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className={cn('text-[10px] font-semibold', visual.color)}>
            {visual.label}
          </span>
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] tabular-nums',
              visual.surface,
              visual.border,
              visual.color,
            )}
          >
            <Clock3 className="size-2.5" />
            {duration}
          </span>
          {isError ? (
            <XCircle className="size-3 text-destructive" />
          ) : (
            <CheckCircle2 className="size-3 text-[var(--status-success)]" />
          )}
        </div>
        <div
          className={cn(
            'rounded-2xl rounded-tl-md border px-3 py-2 text-[11px] leading-relaxed text-[var(--text-secondary)] shadow-sm',
            isError
              ? 'border-destructive/20 bg-destructive/5'
              : cn(visual.surface, visual.border),
          )}
        >
          <p className="whitespace-pre-wrap break-words">{displayText}</p>
          {isLong && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className={cn('mt-1 text-[10px] font-medium hover:underline', visual.color)}
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

function DebateRoundBubble({
  round,
  challenger,
  defender,
  summary,
  durationMs,
}: {
  round: number;
  challenger: CollaborationRole;
  defender: CollaborationRole;
  summary: string;
  durationMs: number;
}) {
  const duration =
    durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10, scale: 0.97 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      className="mx-2 flex flex-col gap-2 rounded-xl border border-[var(--status-warning-border)] bg-[var(--status-warning-faint)] p-3 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-full border border-[var(--status-warning-border)] bg-[var(--status-warning-subtle)] px-2 py-1 text-[10px] font-semibold text-[var(--status-warning)]">
          <Swords className="size-3" />
          Round {round}
        </div>
        <div className="flex items-center gap-1.5">
          <CollaborationRoleBadge role={challenger} size="sm" />
          <Zap className="size-3 text-[var(--status-warning)]" />
          <CollaborationRoleBadge role={defender} size="sm" />
        </div>
        <span className="ml-auto text-[9px] tabular-nums text-[var(--text-muted)]">
          {duration}
        </span>
      </div>
      <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
        {summary}
      </p>
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
      className="flex items-center gap-3 px-2"
    >
      <div className="h-px flex-1 bg-[var(--border-default)]" />
      <div className="flex items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2 py-1 shadow-sm">
        <div
          className={cn(
            'flex size-5 items-center justify-center rounded-md border',
            config.surface,
            config.border,
            config.color,
          )}
        >
          <Icon className="size-2.5" />
        </div>
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
  const elapsed = useElapsedTimer(
    status !== 'idle' && status !== 'complete' && status !== 'error',
  );

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
  const allRoles: CollaborationRole[] = [
    'coordinator',
    'researcher',
    'analyst',
    'visionary',
  ];

  return (
    <div className="flex items-center gap-1.5">
      {allRoles.map((role) => {
        const visual = COLLABORATION_ROLE_VISUALS[role];
        const isActive = activeRoles.has(role);
        return (
          <motion.div
            key={role}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: isActive ? 1 : 0.4, scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
            className={cn(
              'flex items-center gap-1 rounded-full border px-1.5 py-0.5 transition-all duration-300',
              isActive
                ? cn(visual.surface, visual.border)
                : 'border-transparent bg-transparent',
            )}
            title={visual.label}
          >
            <CollaborationRoleBadge role={role} size="sm" />
            {isActive && (
              <span className={cn('text-[9px] font-medium', visual.color)}>
                {visual.label}
              </span>
            )}
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

  const activeRoles = useMemo(() => {
    const roles = new Set<CollaborationRole>();
    for (const item of feed) {
      if (item.kind === 'typing' || item.kind === 'message') roles.add(item.role);
      if (item.kind === 'debate-round') {
        roles.add(item.challenger);
        roles.add(item.defender);
      }
    }
    return roles;
  }, [feed]);

  if (status === 'idle' || status === 'complete') return null;

  const RoomIcon = strategy === 'debate' ? Swords : Users;
  const roomLabel = strategy === 'debate' ? 'Debate room' : 'Agent room';
  const roomSubtitle =
    strategy === 'debate'
      ? 'Specialists challenge and defend positions in rounds.'
      : 'Specialists share progress as the answer comes together.';

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--collab-primary-border)] bg-[var(--bg-surface)] shadow-sm"
    >
      <div className="flex items-center gap-3 border-b border-[var(--border-default)] bg-gradient-to-r from-[var(--collab-primary-muted)] to-transparent px-3 py-2">
        <div className="flex size-7 items-center justify-center rounded-lg border border-[var(--collab-primary-border)] bg-[var(--collab-primary-subtle)] text-[var(--collab-primary)]">
          <RoomIcon className="size-3.5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-[var(--text-primary)]">
            {roomLabel}
          </div>
          <div className="truncate text-[10px] text-[var(--text-muted)]">
            {roomSubtitle}
          </div>
        </div>
        <OnlineRoster activeRoles={activeRoles} />
        <ElapsedTimer />
      </div>

      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 py-3"
      >
        <AnimatePresence mode="popLayout">
          {feed.map((item) => {
            switch (item.kind) {
              case 'phase':
                return <PhaseBanner key={item.key} phase={item.phase} />;
              case 'typing':
                return <TypingBubble key={item.key} role={item.role} />;
              case 'message':
                return (
                  <MessageBubble
                    key={item.key}
                    role={item.role}
                    text={item.text}
                    durationMs={item.durationMs}
                    isError={item.isError}
                  />
                );
              case 'debate-round':
                return (
                  <DebateRoundBubble
                    key={item.key}
                    round={item.round}
                    challenger={item.challenger}
                    defender={item.defender}
                    summary={item.summary}
                    durationMs={item.durationMs}
                  />
                );
            }
          })}
        </AnimatePresence>
      </div>

      {status === 'error' && (
        <div className="flex items-center gap-1.5 border-t border-destructive/20 bg-destructive/5 px-3 py-2">
          <XCircle className="size-3 text-destructive" />
          <span className="text-[10px] text-destructive">
            Connection lost — an error occurred
          </span>
        </div>
      )}
    </motion.section>
  );
}
