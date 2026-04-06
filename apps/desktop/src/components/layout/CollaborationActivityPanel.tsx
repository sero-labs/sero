/**
 * CollaborationActivityPanel — "Group Chat" style visualization
 * that makes multi-agent collaboration feel like eavesdropping on
 * a lively team chat room. Each agent has a distinct icon, color,
 * and personality. Messages appear as chat bubbles with typing
 * indicators, reactions, and phase banners.
 *
 * Sub-components live in CollaborationFeedItems.tsx.
 */

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Swords, Users, XCircle } from 'lucide-react';
import {
  useFocusedAgent,
  useFocusedCollaborationStatus,
  useFocusedCollaborationStrategy,
} from '@/stores/agent-selectors';
import { cn } from '@sero-ai/ui/lib/utils';
import type { CollaborationRole } from '@/types/collaboration';
import { useChatFeed } from './collaboration-chat-feed';
import { useCollaborationSubagentEntries } from './useCollaborationSubagentEntries';
import {
  TypingBubble,
  MessageBubble,
  DebateRoundBubble,
  PhaseBanner,
  OnlineRoster,
  ElapsedTimer,
  useAutoScroll,
} from './CollaborationFeedItems';

export function CollaborationActivityPanel() {
  const focused = useFocusedAgent();
  const status = useFocusedCollaborationStatus();
  const strategy = useFocusedCollaborationStrategy();
  const feed = useChatFeed();
  const scrollRef = useAutoScroll(feed.length);
  const { latestEntryByRole } = useCollaborationSubagentEntries(
    focused?.sessionId ?? null,
    focused?.workspaceId ?? null,
  );

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
                return (
                  <TypingBubble
                    key={item.key}
                    role={item.role}
                    liveEntry={latestEntryByRole.get(item.role)}
                  />
                );
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
