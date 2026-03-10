/**
 * EditorToolbar — toolbar above the editor with document info,
 * language selector, and action buttons.
 */

import { memo } from 'react';
import { cn } from '@sero/ui/lib/utils';
import { Button } from '@sero/ui/components/ui/button';
import type { CanvasDocument, CodeLanguage } from '../../shared/types';

const LANGUAGES: { value: CodeLanguage; label: string }[] = [
  { value: 'plaintext', label: 'Plain Text' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
];

interface EditorToolbarProps {
  document: CanvasDocument;
  showVersions: boolean;
  loading: boolean;
  onToggleVersions: () => void;
  onSnapshot: () => void;
  onLanguageChange: (lang: CodeLanguage) => void;
  onTitleChange: (title: string) => void;
}

export const EditorToolbar = memo(function EditorToolbar({
  document: doc,
  showVersions,
  loading,
  onToggleVersions,
  onSnapshot,
  onLanguageChange,
  onTitleChange,
}: EditorToolbarProps) {
  return (
    <div className="flex items-center gap-2 border-b border-border/20 px-3 py-1.5">
      {/* Editable title */}
      <input
        type="text"
        value={doc.title}
        onChange={(e) => onTitleChange(e.target.value)}
        className={cn(
          'min-w-0 flex-1 bg-transparent text-sm font-medium text-foreground',
          'focus:outline-none',
          'placeholder:text-muted-foreground/40',
        )}
        placeholder="Untitled"
      />

      {/* AI loading indicator */}
      {loading && (
        <span className="canvas-ai-indicator text-[10px] text-primary">
          AI writing...
        </span>
      )}

      {/* Language selector (code documents only) */}
      {doc.type === 'code' && (
        <select
          value={doc.language}
          onChange={(e) => onLanguageChange(e.target.value as CodeLanguage)}
          className={cn(
            'rounded-md border border-border/30 bg-background px-2 py-0.5',
            'text-[11px] text-muted-foreground',
            'focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        >
          {LANGUAGES.map((lang) => (
            <option key={lang.value} value={lang.value}>{lang.label}</option>
          ))}
        </select>
      )}

      {/* Document type badge */}
      <span className={cn(
        'rounded px-1.5 py-0.5 text-[10px] font-medium',
        doc.type === 'code'
          ? 'bg-indigo-500/10 text-indigo-400'
          : 'bg-emerald-500/10 text-emerald-400',
      )}>
        {doc.type === 'code' ? 'CODE' : 'TEXT'}
      </span>

      {/* Actions */}
      <Button
        variant="ghost"
        size="xs"
        className="text-[11px] text-muted-foreground hover:text-foreground"
        onClick={onSnapshot}
      >
        Snapshot
      </Button>

      <Button
        variant="ghost"
        size="xs"
        className={cn(
          'text-[11px]',
          showVersions
            ? 'text-primary'
            : 'text-muted-foreground hover:text-foreground',
        )}
        onClick={onToggleVersions}
      >
        History ({doc.versions.length})
      </Button>
    </div>
  );
});
