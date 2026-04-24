/**
 * Composer attachment queue — cross-component bridge for pushing files
 * (screenshots, downloaded captures, drag-saved assets) into the chat
 * composer from anywhere in the app.
 *
 * The composer's `<PromptInput>` owns its own attachment state internally.
 * This store is a thin FIFO that a small bridge component inside
 * `<PromptInput>` drains by calling `attachments.add(files)`; the files
 * then flow through the normal submit path (becoming ChatAttachment[] on
 * send).
 */

import { create } from 'zustand';

interface ComposerAttachmentQueueState {
  pending: File[];
  /** Push a File into the queue. The composer bridge will pick it up. */
  push: (file: File) => void;
  /** Push multiple files at once. */
  pushMany: (files: File[]) => void;
  /** Pull all pending files and clear the queue. Called by the bridge. */
  consume: () => File[];
}

export const useComposerAttachmentQueue = create<ComposerAttachmentQueueState>(
  (set, get) => ({
    pending: [],
    push: (file) => set((s) => ({ pending: [...s.pending, file] })),
    pushMany: (files) => set((s) => ({ pending: [...s.pending, ...files] })),
    consume: () => {
      const { pending } = get();
      if (pending.length === 0) return [];
      set({ pending: [] });
      return pending;
    },
  }),
);
