/**
 * PromptEditor, form for editing prompt template metadata + body.
 *
 * Prompt templates are .md files with optional YAML frontmatter
 * (description). The filename becomes the /slash command name.
 * Body supports $1, $2, $@ argument placeholders.
 */

import { useCallback } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import type { PromptTemplateFileData } from './types';

interface PromptEditorProps {
  data: PromptTemplateFileData;
  isNew: boolean;
  saving: boolean;
  onSave: (data: PromptTemplateFileData) => void;
  onDelete: (filePath: string) => void;
  onChange: (data: PromptTemplateFileData) => void;
}

/** Must match VALID_NAME in electron/ipc/prompts.ts */
const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

export function PromptEditor({ data, isNew, saving, onSave, onDelete, onChange }: PromptEditorProps) {
  const update = useCallback(
    (partial: Partial<PromptTemplateFileData>) => onChange({ ...data, ...partial }),
    [data, onChange],
  );

  const canSave = data.name.length > 0 && NAME_RE.test(data.name) && data.body.length > 0;
  const canDelete = !isNew && !!data.filePath;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSave) onSave(data);
  };

  return (
    <form onSubmit={handleSave} className="flex flex-1 flex-col min-h-0">
      {/* ── Header bar ─────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <span className="flex-1 text-sm font-medium text-foreground truncate">
          {isNew ? 'New Prompt Template' : `/${data.name}`}
        </span>
        {canDelete && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(data.filePath!)}
          >
            <Trash2 className="size-3.5" />
            Delete
          </Button>
        )}
        <Button type="submit" size="sm" disabled={!canSave || saving}>
          {saving ? 'Saving...' : (
            <>
              <Save className="size-3.5" />
              Save
            </>
          )}
        </Button>
      </div>

      {/* ── Metadata fields ────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 border-b border-border px-4 py-3">
        <Field label="Name" hint="becomes /name command">
          <input aria-label="Prompt name"
            type="text"
            value={data.name}
            onChange={(e) => update({ name: e.target.value })}
            disabled={!isNew}
            placeholder="review"
            className={cn(fieldClass, !isNew && 'opacity-60')}
          />
        </Field>

        <Field label="Description">
          <input aria-label="Prompt description"
            type="text"
            value={data.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="What this prompt does"
            className={fieldClass}
          />
        </Field>
      </div>

      {/* ── Help bar ───────────────────────────────────── */}
      <div className="border-b border-border/50 bg-muted/30 px-4 py-1.5">
        <p className="text-[10px] text-muted-foreground">
          Use <code className="rounded bg-muted px-1">$1</code>,{' '}
          <code className="rounded bg-muted px-1">$2</code> for positional args,{' '}
          <code className="rounded bg-muted px-1">$@</code> for all args.{' '}
          Invoked as <code className="rounded bg-muted px-1">/{data.name || 'name'} arg1 arg2</code>
        </p>
      </div>

      {/* ── Template body ──────────────────────────────── */}
      <div className="flex flex-1 flex-col min-h-0 px-4 py-3">
        <label htmlFor="prompt-template-body" className="mb-1.5 text-xs font-medium text-muted-foreground">
          Template Body
        </label>
        <textarea
          id="prompt-template-body"
          value={data.body}
          onChange={(e) => update({ body: e.target.value })}
          placeholder="Review the staged changes (`git diff --cached`). Focus on:&#10;&#10;- Bugs and logic errors&#10;- Security issues&#10;- Error handling gaps"
          className={cn(
            'flex-1 min-h-0 resize-none rounded-md border border-input bg-background',
            'px-3 py-2 text-sm text-foreground font-mono leading-relaxed',
            'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        />
      </div>
    </form>
  );
}

// ── Helpers ──────────────────────────────────────────────────

const fieldClass = cn(
  'w-full rounded-md border border-input bg-background',
  'px-2.5 py-1.5 text-sm text-foreground',
  'placeholder:text-muted-foreground',
  'focus:outline-none focus:ring-1 focus:ring-ring',
);

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
        {hint && (
          <span className="ml-1 font-normal text-muted-foreground/50">({hint})</span>
        )}
      </label>
      {children}
    </div>
  );
}
