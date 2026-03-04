/**
 * SkillEditor — form for editing skill metadata + SKILL.md body.
 */

import { useCallback } from 'react';
import { Button } from '@sero/ui/components/ui/button';
import { cn } from '@sero/ui/lib/utils';
import type { SkillFileData } from './types';

interface SkillEditorProps {
  data: SkillFileData;
  isNew: boolean;
  saving: boolean;
  onSave: (data: SkillFileData) => void;
  /** Called with the skill's filePath for existing skills. */
  onDelete: (filePath: string) => void;
  onChange: (data: SkillFileData) => void;
}

const NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;

export function SkillEditor({ data, isNew, saving, onSave, onDelete, onChange }: SkillEditorProps) {
  const update = useCallback(
    (partial: Partial<SkillFileData>) => onChange({ ...data, ...partial }),
    [data, onChange],
  );

  const canSave = data.name.length > 0 && NAME_RE.test(data.name) && data.body.length > 0;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSave) onSave(data);
  };

  return (
    <form onSubmit={handleSave} className="flex flex-1 flex-col min-h-0">
      {/* ── Header bar ─────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <span className="flex-1 text-sm font-medium text-foreground truncate">
          {isNew ? 'New Skill' : data.name}
        </span>
        {!isNew && data.filePath && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(data.filePath!)}
          >
            🗑 Delete
          </Button>
        )}
        <Button type="submit" size="sm" disabled={!canSave || saving}>
          {saving ? 'Saving…' : '💾 Save'}
        </Button>
      </div>

      {/* ── Metadata fields ────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 border-b border-border px-4 py-3">
        <Field label="Name" hint="lowercase, hyphens/dots">
          <input
            type="text"
            value={data.name}
            onChange={(e) => update({ name: e.target.value })}
            disabled={!isNew}
            placeholder="my-skill"
            className={cn(fieldClass, !isNew && 'opacity-60')}
          />
        </Field>

        <Field label="Description">
          <input
            type="text"
            value={data.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="What this skill does"
            className={fieldClass}
          />
        </Field>
      </div>

      {/* ── Skill body (SKILL.md content after frontmatter) ── */}
      <div className="flex flex-1 flex-col min-h-0 px-4 py-3">
        <label className="mb-1.5 text-xs font-medium text-muted-foreground">
          Skill Body
        </label>
        <textarea
          value={data.body}
          onChange={(e) => update({ body: e.target.value })}
          placeholder="# My Skill&#10;&#10;Instructions for the agent when this skill is active..."
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
