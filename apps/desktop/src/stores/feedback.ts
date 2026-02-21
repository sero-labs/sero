/**
 * Response feedback store — tracks user ratings of agent responses.
 *
 * Persisted to ~/.sero-ui/agent/feedback.json via IPC.
 * Loaded once on init; updated optimistically on each action.
 */

import { create } from 'zustand';
import type { ResponseFeedbackEntry } from '@/types/ipc';

interface FeedbackState {
  /** Map of messageId → rating for quick lookup in the UI. */
  ratings: Record<string, 'good' | 'bad'>;
  /** Whether the store has loaded from disk yet. */
  loaded: boolean;

  /** Load all feedback from disk. Call once on app start. */
  init: () => Promise<void>;

  /** Submit a rating for a message. Upserts. */
  rate: (entry: Omit<ResponseFeedbackEntry, 'timestamp'>) => Promise<void>;

  /** Toggle off an existing rating (remove feedback). */
  unrate: (messageId: string) => Promise<void>;
}

export const useFeedbackStore = create<FeedbackState>((set, get) => ({
  ratings: {},
  loaded: false,

  init: async () => {
    if (get().loaded) return;
    try {
      const state = await window.sero.feedback.load();
      const ratings: Record<string, 'good' | 'bad'> = {};
      for (const entry of state.entries) {
        ratings[entry.messageId] = entry.rating;
      }
      set({ ratings, loaded: true });
    } catch {
      set({ loaded: true });
    }
  },

  rate: async (entry) => {
    const full: ResponseFeedbackEntry = {
      ...entry,
      timestamp: new Date().toISOString(),
    };

    // Optimistic update
    set((s) => ({
      ratings: { ...s.ratings, [entry.messageId]: entry.rating },
    }));

    try {
      await window.sero.feedback.submit(full);
    } catch (err) {
      console.error('[feedback] Failed to save rating:', err);
    }
  },

  unrate: async (messageId) => {
    // Optimistic update
    set((s) => {
      const { [messageId]: _, ...rest } = s.ratings;
      return { ratings: rest };
    });

    try {
      await window.sero.feedback.remove(messageId);
    } catch (err) {
      console.error('[feedback] Failed to remove rating:', err);
    }
  },
}));
