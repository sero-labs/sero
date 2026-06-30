/**
 * GlobalQuestionPrompt — surfaces a pending user-feedback question (or permission
 * gate) prominently when the Chat panel is closed.
 *
 * The Chat panel renders PendingQuestionCard inline, but a background job — e.g. an
 * Orchestrator loop's dirty-workspace prompt — can raise a question while the user
 * is on another app with the chat collapsed. Without this surface the question
 * would sit unseen until it times out. Mounted once at the App root; renders only
 * when the chat panel is closed, so it never duplicates the inline card.
 */

import { motion } from 'motion/react';
import { useAppStore } from '@/stores/app';
import { useUserFeedbackStore } from '@/stores/user-feedback-store';
import { PendingQuestionCard } from '@/components/layout/PendingQuestionCard';

export function GlobalQuestionPrompt() {
  const chatPanelOpen = useAppStore((s) => s.chatPanelOpen);
  const questionPending = useUserFeedbackStore((s) => s.getPending('question'));
  const permissionPending = useUserFeedbackStore((s) => s.getPending('permission'));
  const pending = permissionPending ?? questionPending;

  // The Chat panel already shows these inline when open — avoid a duplicate.
  if (chatPanelOpen || !pending) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed bottom-4 right-4 z-50 w-[26rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl bg-[var(--bg-base)] shadow-2xl ring-1 ring-status-info-border"
    >
      <div className="px-3 pt-2.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-muted)]">
        Needs your input
      </div>
      <PendingQuestionCard />
    </motion.div>
  );
}
