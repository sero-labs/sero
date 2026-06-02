/**
 * Sub-components for CollaborationActivityPanel.
 * Extracted to keep CollaborationActivityPanel.tsx under 500 LOC.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Clock3, Swords, XCircle, Zap } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { SubagentEntry } from '@/types/ipc';
import type { CollaborationRole } from '@/types/collaboration';
import { useElapsedTimer } from './useCollaborationTimer';
import { PHASE_BANNERS } from './collaboration-chat-feed';
import {
  COLLABORATION_ROLE_VISUALS,
  CollaborationRoleBadge,
} from './collaboration-visuals';
import { CollaborationLiveActivity } from './CollaborationLiveActivity';
import { useFocusedCollaborationStatus } from '@/stores/agent-selectors';

// ── Pending user query bubble ───────────────────────────────────

export function PendingQueryBubble({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 350, damping: 24 }}
      className="flex justify-end px-2"
    >
      <div className="max-w-[92%] rounded-2xl rounded-tr-md border border-[var(--border-default)] bg-[var(--bg-elevated)] px-3 py-2 shadow-sm">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Your query
        </div>
        <p className="whitespace-pre-wrap break-words text-[11px] leading-relaxed text-[var(--text-primary)]">
          {text}
        </p>
      </div>
    </motion.div>
  );
}

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

export function TypingBubble({
  role,
  liveEntry,
}: {
  role: CollaborationRole;
  liveEntry?: SubagentEntry | null;
}) {
  const visual = COLLABORATION_ROLE_VISUALS[role];
  const isRightAligned = visual.lane === 'right';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={cn('flex px-2', isRightAligned ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'flex max-w-[92%] items-end gap-2',
          isRightAligned && 'flex-row-reverse',
        )}
      >
        <CollaborationRoleBadge role={role} pulse />
        <div className={cn('flex min-w-0 max-w-[26rem] flex-col gap-1', isRightAligned && 'items-end')}>
          <span className={cn('px-1 text-[10px] font-semibold', visual.color)}>
            {visual.label}
          </span>
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-2xl border px-3 py-2',
              isRightAligned ? 'rounded-br-md' : 'rounded-bl-md',
              visual.surface,
              visual.border,
            )}
          >
            <span className={cn('text-[11px] italic', visual.color)}>
              {visual.statusVerb}
            </span>
            <TypingDots colorClass={visual.color} />
          </div>
          <CollaborationLiveActivity
            entry={liveEntry ?? null}
            accentClass={visual.color}
            borderClass={visual.border}
          />
        </div>
      </div>
    </motion.div>
  );
}

// ── Chat message bubble ─────────────────────────────────────────

export function MessageBubble({
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
  const isRightAligned = visual.lane === 'right';
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
      className={cn('flex px-2', isRightAligned ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'flex max-w-[92%] items-start gap-2',
          isRightAligned && 'flex-row-reverse',
        )}
      >
        <CollaborationRoleBadge role={role} />
        <div className={cn('flex min-w-0 max-w-[26rem] flex-col gap-1', isRightAligned && 'items-end')}>
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
              <CheckCircle2 className="size-3 text-status-success" />
            )}
          </div>
          <div
            className={cn(
              'rounded-2xl border px-3 py-2 text-[11px] leading-relaxed text-[var(--text-secondary)] shadow-sm',
              isRightAligned ? 'rounded-tr-md' : 'rounded-tl-md',
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
      </div>
    </motion.div>
  );
}

// ── Debate round card ───────────────────────────────────────────

export function DebateRoundBubble({
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
      className="mx-2 flex flex-col gap-2 rounded-xl border border-status-warning-border bg-status-warning-faint p-3 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-full border border-status-warning-border bg-status-warning-subtle px-2 py-1 text-[10px] font-semibold text-status-warning">
          <Swords className="size-3" />
          Round {round}
        </div>
        <div className="flex items-center gap-1.5">
          <CollaborationRoleBadge role={challenger} size="sm" />
          <Zap className="size-3 text-status-warning" />
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

export function PhaseBanner({ phase }: { phase: string }) {
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

export function ElapsedTimer() {
  const status = useFocusedCollaborationStatus();
  const elapsed = useElapsedTimer(
    status !== 'idle' && status !== 'complete' && status !== 'error',
  );

  if (elapsed === 0) return null;

  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  return (
    <span className="ml-auto flex items-center gap-1 text-[10px] tabular-nums text-[var(--text-muted)]">
      <span className="size-1.5 rounded-full bg-status-success animate-pulse" />
      {mins > 0 ? `${mins}m ${secs}s` : `${secs}s`}
    </span>
  );
}

// ── Online roster (who's "in the room") ─────────────────────────

export function OnlineRoster({ activeRoles }: { activeRoles: Set<CollaborationRole> }) {
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

export function useAutoScroll(feedLen: number) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  const prevLen = useRef(0);
  useEffect(() => {
    if (feedLen === prevLen.current) {
      return undefined;
    }

    prevLen.current = feedLen;
    const frame = requestAnimationFrame(() => {
      scrollToBottom();
    });

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [feedLen, scrollToBottom]);

  return scrollRef;
}
