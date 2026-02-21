import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentInfo,
  AttachmentRemove,
} from '@sero/ui/components/ai-elements/attachments';
import {
  usePromptInputAttachments,
} from '@sero/ui/components/ai-elements/prompt-input';
import type { ChatAttachment } from '@/types/ipc';

// ── Prompt input attachment bar (inline badges) ────────────────

/**
 * Renders queued attachments inside the PromptInput header.
 * Uses the `inline` variant — compact badges with hover-reveal remove buttons.
 * Must be rendered inside a <PromptInput> context.
 */
export function PromptAttachmentsBar() {
  const attachments = usePromptInputAttachments();

  if (attachments.files.length === 0) return null;

  return (
    <Attachments variant="inline" className="px-1 pb-1">
      {attachments.files.map((file) => (
        <Attachment
          key={file.id}
          data={file}
          onRemove={() => attachments.remove(file.id)}
        >
          <AttachmentPreview />
          <AttachmentInfo />
          <AttachmentRemove />
        </Attachment>
      ))}
    </Attachments>
  );
}

// ── Message attachment grid (thumbnails in chat history) ───────

interface MessageAttachmentsProps {
  attachments: ChatAttachment[];
}

/**
 * Renders attachments inside a user message bubble.
 * Uses the `grid` variant — visual thumbnails for images, icons for files.
 */
export function MessageAttachments({ attachments }: MessageAttachmentsProps) {
  if (!attachments.length) return null;

  // Convert ChatAttachment → FileUIPart shape for ai-elements
  const files = attachments.map((a) => ({
    id: a.id,
    type: 'file' as const,
    url: a.url,
    filename: a.filename ?? 'Attachment',
    mediaType: a.mediaType ?? 'application/octet-stream',
  }));

  return (
    <Attachments variant="grid" className="mt-2">
      {files.map((file) => (
        <Attachment key={file.id} data={file}>
          <AttachmentPreview />
        </Attachment>
      ))}
    </Attachments>
  );
}
