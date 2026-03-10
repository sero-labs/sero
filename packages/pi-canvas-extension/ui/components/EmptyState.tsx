/**
 * EmptyState — shown when no document is selected.
 */

import { memo } from 'react';
import { Button } from '@sero/ui/components/ui/button';

interface EmptyStateProps {
  hasDocuments: boolean;
  onCreateNew: () => void;
  onPromptAgent: () => void;
}

export const EmptyState = memo(function EmptyState({
  hasDocuments,
  onCreateNew,
  onPromptAgent,
}: EmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
      <div className="space-y-2">
        <h2 className="text-lg font-medium text-foreground/80">
          {hasDocuments ? 'Select a document' : 'Welcome to Canvas'}
        </h2>
        <p className="max-w-sm text-sm text-muted-foreground/50">
          {hasDocuments
            ? 'Choose a document from the sidebar to start editing.'
            : 'Canvas is your collaborative workspace for writing and coding. Create a document or ask the AI to draft one for you.'}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          className="text-xs"
          onClick={onCreateNew}
        >
          New Document
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={onPromptAgent}
        >
          Ask AI to draft
        </Button>
      </div>
    </div>
  );
});
