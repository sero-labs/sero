/**
 * useMessageQueue — manages a follow-up message queue for the ChatPanel.
 *
 * When the agent is streaming, additional messages are queued instead of
 * being sent immediately.  When streaming ends, the next queued message
 * is automatically sent (dequeued).
 *
 * The user can:
 * - Queue a message while the agent is busy
 * - Remove a queued message before it's sent
 * - Edit a queued message (remove + re-queue)
 * - "Steer" the agent by queueing an interruption message
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { ChatAttachment } from '@/types/ipc';

export interface QueuedMessage {
  id: string;
  text: string;
  attachments?: ChatAttachment[];
}

interface UseMessageQueueOptions {
  /** Whether the agent is currently streaming. */
  isStreaming: boolean;
  /** The session ID to send to. */
  sessionId: string | null;
  /** The send function to call when dequeuing. */
  sendPrompt: (sessionId: string, text: string, attachments?: ChatAttachment[]) => void;
}

export function useMessageQueue({
  isStreaming,
  sessionId,
  sendPrompt,
}: UseMessageQueueOptions) {
  const [queue, setQueue] = useState<QueuedMessage[]>([]);
  const prevStreamingRef = useRef(isStreaming);

  /** Add a message to the queue. */
  const enqueue = useCallback((text: string, attachments?: ChatAttachment[]) => {
    const id = `q-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setQueue((prev) => [...prev, { id, text, attachments }]);
  }, []);

  /** Remove a queued message by ID. */
  const dequeue = useCallback((id: string) => {
    setQueue((prev) => prev.filter((m) => m.id !== id));
  }, []);

  /** Clear all queued messages. */
  const clearQueue = useCallback(() => {
    setQueue([]);
  }, []);

  // Auto-send the next queued message when streaming stops.
  useEffect(() => {
    if (prevStreamingRef.current && !isStreaming && sessionId) {
      // Streaming just stopped — send next queued message
      setQueue((prev) => {
        if (prev.length === 0) return prev;
        const [next, ...rest] = prev;
        // Schedule the send asynchronously to avoid state update conflicts
        setTimeout(() => {
          sendPrompt(sessionId, next.text, next.attachments);
        }, 100);
        return rest;
      });
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, sessionId, sendPrompt]);

  return {
    queue,
    enqueue,
    dequeue,
    clearQueue,
    hasQueued: queue.length > 0,
  };
}
