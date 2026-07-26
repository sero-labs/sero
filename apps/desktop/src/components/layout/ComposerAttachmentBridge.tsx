/**
 * Bridges the app-wide `useComposerAttachmentQueue` into the local
 * `<PromptInput>` attachments context. Mount as a child of `<PromptInput>`.
 * Each time new files land in the queue, they're forwarded into the
 * composer's attachment state and the queue is drained.
 */

import { useEffect } from 'react';
import { usePromptInputAttachments } from '@sero-ai/ui/ai-elements/prompt-input-context';
import { useComposerAttachmentQueue } from '@/stores/composer-attachments';

export function ComposerAttachmentBridge() {
  const attachments = usePromptInputAttachments();
  const pendingCount = useComposerAttachmentQueue((s) => s.pending.length);
  const consume = useComposerAttachmentQueue((s) => s.consume);
  const addAttachments = attachments.add;

  useEffect(() => {
    if (pendingCount === 0) return;
    const files = consume();
    if (files.length > 0) addAttachments(files);
  }, [pendingCount, consume, addAttachments]);

  return null;
}
