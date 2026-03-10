/**
 * EditorArea — the main editable textarea for canvas documents.
 * Adapts style based on document type (text vs code).
 */

import { memo } from 'react';
import { cn } from '@sero/ui/lib/utils';
import { ScrollArea } from '@sero/ui/components/ui/scroll-area';
import type { DocumentType } from '../../shared/types';

interface EditorAreaProps {
  content: string;
  type: DocumentType;
  onChange: (content: string) => void;
}

export const EditorArea = memo(function EditorArea({
  content,
  type,
  onChange,
}: EditorAreaProps) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          type === 'code'
            ? 'Start writing code, or ask the AI to generate something...'
            : 'Start writing, or ask the AI to draft something for you...'
        }
        spellCheck={type !== 'code'}
        className={cn(
          'canvas-editor w-full min-h-full resize-none bg-transparent',
          'px-5 py-4 text-foreground',
          'placeholder:text-muted-foreground/25',
          type === 'code'
            ? 'code-editor'
            : 'text-[14px] leading-[1.8]',
        )}
        style={{ fieldSizing: 'content' } as React.CSSProperties}
      />
    </ScrollArea>
  );
});
