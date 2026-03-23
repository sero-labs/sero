/**
 * ImageAttachBar — attach reference images to a generation prompt.
 *
 * Shows an attach button + inline thumbnails of queued images.
 * Max 4 images, 10 MB each. Accepts image/* files.
 */

import { useRef, useCallback } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { ImageAttachment } from '../../shared/types';

const MAX_ATTACHMENTS = 4;
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

interface ImageAttachBarProps {
  attachments: ImageAttachment[];
  onChange: (attachments: ImageAttachment[]) => void;
  disabled?: boolean;
}

export function ImageAttachBar({ attachments, onChange, disabled }: ImageAttachBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      const remaining = MAX_ATTACHMENTS - attachments.length;
      if (remaining <= 0) return;

      const incoming = Array.from(files).slice(0, remaining);
      const newAttachments: ImageAttachment[] = [];

      for (const file of incoming) {
        if (!file.type.startsWith('image/')) continue;
        if (file.size > MAX_SIZE_BYTES) continue;

        const dataUri = await readFileAsDataUri(file);
        newAttachments.push({
          id: crypto.randomUUID(),
          dataUri,
          mimeType: file.type,
          filename: file.name,
        });
      }

      if (newAttachments.length > 0) {
        onChange([...attachments, ...newAttachments]);
      }
    },
    [attachments, onChange],
  );

  const remove = useCallback(
    (id: string) => onChange(attachments.filter((a) => a.id !== id)),
    [attachments, onChange],
  );

  return (
    <div className="flex items-center gap-2">
      {/* Attach button */}
      <button
        type="button"
        disabled={disabled || attachments.length >= MAX_ATTACHMENTS}
        onClick={() => inputRef.current?.click()}
        className={cn(
          'flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors',
          'text-muted-foreground hover:text-foreground hover:bg-secondary/50',
          'disabled:opacity-40 disabled:pointer-events-none',
        )}
        title={
          attachments.length >= MAX_ATTACHMENTS
            ? `Max ${MAX_ATTACHMENTS} images`
            : 'Attach reference image'
        }
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <path
            d="M14 8.5V12a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2h3.5M10.5 2h3.5v3.5M7 9l7-7"
            stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
          />
        </svg>
        <span>Attach</span>
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
      />

      {/* Thumbnails */}
      {attachments.map((att) => (
        <div
          key={att.id}
          className="group relative h-8 w-8 shrink-0 overflow-hidden rounded-md border border-border bg-secondary"
        >
          <img
            src={att.dataUri}
            alt={att.filename}
            className="h-full w-full object-cover"
          />
          <button
            type="button"
            onClick={() => remove(att.id)}
            className={cn(
              'absolute inset-0 flex items-center justify-center',
              'bg-black/50 text-white opacity-0 transition-opacity',
              'group-hover:opacity-100',
            )}
            aria-label={`Remove ${att.filename}`}
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

function readFileAsDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
