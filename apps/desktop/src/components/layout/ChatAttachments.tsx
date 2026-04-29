import { useCallback, useMemo } from 'react';
import { Trash2 } from 'lucide-react';
import {
  Attachments,
  Attachment,
  AttachmentPreview,
  AttachmentInfo,
  AttachmentRemove,
} from '@sero-ai/ui/components/ai-elements/attachments';
import {
  usePromptInputAttachments,
} from '@sero-ai/ui/components/ai-elements/prompt-input';
import type { ChatAttachment } from '@/types/ipc';
import { useLightbox, type LightboxImage } from './ImageLightbox';

// ── Prompt input attachment bar (inline badges) ────────────────

/**
 * Renders queued attachments inside the PromptInput header.
 * Uses the `inline` variant — compact badges with hover-reveal remove buttons.
 * Must be rendered inside a <PromptInput> context.
 *
 * Shows a compact count + "Clear all" affordance above the badges when more
 * than one item is queued so the user can reset without clicking each ×.
 */
export function PromptAttachmentsBar() {
  const attachments = usePromptInputAttachments();

  const count = attachments.files.length;
  if (count === 0) return null;

  return (
    <div className="flex flex-col gap-1 px-1 pb-1">
      {count > 1 && (
        <div className="flex items-center justify-between px-1 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
          <span>{count} attachments</span>
          <button
            type="button"
            onClick={() => attachments.clear()}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
            title="Remove all attachments"
          >
            <Trash2 className="size-3" />
            Clear all
          </button>
        </div>
      )}
      <Attachments variant="inline">
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
    </div>
  );
}

// ── Message attachment grid (thumbnails in chat history) ───────

interface MessageAttachmentsProps {
  attachments: ChatAttachment[];
}

/**
 * Renders attachments inside a user message bubble.
 * Uses the `grid` variant — visual thumbnails for images, icons for files.
 * Clicking an image opens the lightbox preview.
 */
export function MessageAttachments({ attachments }: MessageAttachmentsProps) {
  const showLightbox = useLightbox((s) => s.show);

  // Build lightbox images for clickable image attachments
  const lightboxImages: LightboxImage[] = useMemo(
    () =>
      attachments
        .filter((a) => a.mediaType?.startsWith('image/'))
        .map((a) => ({
          src: a.url,
          mimeType: a.mediaType,
          alt: a.filename ?? 'Attachment',
        })),
    [attachments],
  );

  const handleImageClick = useCallback(
    (attachmentId: string) => {
      const imageIndex = attachments
        .filter((a) => a.mediaType?.startsWith('image/'))
        .findIndex((a) => a.id === attachmentId);
      if (imageIndex >= 0) {
        showLightbox(lightboxImages, imageIndex);
      }
    },
    [attachments, lightboxImages, showLightbox],
  );

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
      {files.map((file) => {
        const isImage = file.mediaType.startsWith('image/');
        return (
          <Attachment
            key={file.id}
            data={file}
            className={isImage ? 'cursor-pointer' : undefined}
            onClick={isImage ? () => handleImageClick(file.id) : undefined}
          >
            <AttachmentPreview />
          </Attachment>
        );
      })}
    </Attachments>
  );
}
