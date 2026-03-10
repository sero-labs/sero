/**
 * DocumentList — sidebar listing all canvas documents with create button.
 */

import { useState, useCallback, memo } from 'react';
import { cn } from '@sero/ui/lib/utils';
import { Button } from '@sero/ui/components/ui/button';
import type { CanvasDocument, DocumentType } from '../../shared/types';

interface DocumentListProps {
  documents: CanvasDocument[];
  activeDocumentId: number | null;
  onSelect: (id: number) => void;
  onCreate: (title: string, type: DocumentType) => void;
  onDelete: (id: number) => void;
}

export const DocumentList = memo(function DocumentList({
  documents,
  activeDocumentId,
  onSelect,
  onCreate,
  onDelete,
}: DocumentListProps) {
  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<DocumentType>('text');

  const handleCreate = useCallback(() => {
    const title = newTitle.trim();
    if (!title) return;
    onCreate(title, newType);
    setNewTitle('');
    setShowForm(false);
  }, [newTitle, newType, onCreate]);

  return (
    <div className="flex h-full flex-col border-r border-border/30">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/20 px-3 py-2.5">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Documents
        </span>
        <Button
          variant="ghost"
          size="xs"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setShowForm(!showForm)}
        >
          {showForm ? 'Cancel' : '+ New'}
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={(e) => { e.preventDefault(); handleCreate(); }}
          className="border-b border-border/20 px-3 py-2 space-y-2"
        >
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Document title..."
            autoFocus
            className={cn(
              'w-full rounded-md border border-input bg-background px-2.5 py-1.5',
              'text-xs text-foreground placeholder:text-muted-foreground/40',
              'focus:outline-none focus:ring-1 focus:ring-ring',
            )}
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setNewType('text')}
              className={cn(
                'flex-1 rounded-md px-2 py-1 text-xs transition-colors',
                newType === 'text'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground',
              )}
            >
              Text
            </button>
            <button
              type="button"
              onClick={() => setNewType('code')}
              className={cn(
                'flex-1 rounded-md px-2 py-1 text-xs transition-colors',
                newType === 'code'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground',
              )}
            >
              Code
            </button>
          </div>
          <Button size="xs" className="w-full text-xs" disabled={!newTitle.trim()}>
            Create
          </Button>
        </form>
      )}

      {/* Document list */}
      <div className="flex-1 overflow-y-auto">
        {documents.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-3 py-12 text-center">
            <p className="text-xs text-muted-foreground/50">No documents yet</p>
            <p className="mt-1 text-[10px] text-muted-foreground/30">
              Create one or ask the agent
            </p>
          </div>
        ) : (
          documents.map((doc) => (
            <div
              key={doc.id}
              onClick={() => onSelect(doc.id)}
              className={cn(
                'canvas-doc-item group cursor-pointer border-b border-border/10 px-3 py-2.5',
                doc.id === activeDocumentId
                  ? 'bg-accent/50'
                  : 'hover:bg-secondary/50',
              )}
            >
              <div className="flex items-start justify-between gap-1">
                <div className="min-w-0 flex-1">
                  <p className={cn(
                    'truncate text-xs font-medium',
                    doc.id === activeDocumentId ? 'text-foreground' : 'text-foreground/80',
                  )}>
                    {doc.title}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground/50">
                    {doc.type === 'code' ? doc.language : 'text'} · v{doc.versions.length}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  className="mt-0.5 h-5 w-5 p-0 text-[10px] text-muted-foreground/30 opacity-0 hover:text-destructive group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(doc.id);
                  }}
                >
                  ×
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
});
