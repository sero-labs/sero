/**
 * SkillEditor, form for editing skill metadata + SKILL.md body.
 * Includes a visibility toggle (merged from Admin's SkillsPanel).
 */

import { useCallback } from 'react';
import { Save, Trash2 } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Switch } from '@sero-ai/ui/components/ui/switch';
import { cn } from '@sero-ai/ui/lib/utils';
import type { SkillFileData, SkillSource } from './types';

interface SkillEditorProps {
  data: SkillFileData;
  isNew: boolean;
  saving: boolean;
  source: SkillSource | null;
  visibleToModel?: boolean;
  lockedHidden?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
  onSave: (data: SkillFileData) => void;
  onDelete: (filePath: string) => void;
  onChange: (data: SkillFileData) => void;
}

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

export function SkillEditor({
  data, isNew, saving, source,
  visibleToModel, lockedHidden, onVisibilityChange,
  onSave, onDelete, onChange,
}: SkillEditorProps) {
  const update = useCallback(
    (partial: Partial<SkillFileData>) => onChange({ ...data, ...partial }),
    [data, onChange],
  );

  const canSave = data.name.length > 0 && NAME_RE.test(data.name) && data.body.length > 0;
  const canDelete = !isNew && data.filePath && source === 'user';

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSave) onSave(data);
  };

  return (
    <form onSubmit={handleSave} className="flex flex-1 flex-col min-h-0">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <span className="flex-1 text-sm font-medium text-foreground truncate">
          {isNew ? 'New Skill' : data.name}
        </span>
        {source && source !== 'user' && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {source}
          </span>
        )}
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

      <div className="grid grid-cols-2 gap-3 border-b border-border px-4 py-3">
        <Field label="Name" hint="lowercase, hyphens only">
          <input aria-label="Skill name"
            type="text"
            value={data.name}
            onChange={(e) => update({ name: e.target.value })}
            disabled={!isNew}
            placeholder="my-skill"
            className={cn(fieldClass, !isNew && 'opacity-60')}
          />
        </Field>

        <Field label="Description">
          <input aria-label="Skill description"
            type="text"
            value={data.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="What this skill does"
            className={fieldClass}
          />
        </Field>
      </div>

      {/* Visibility toggle, only for existing, non-new skills */}
      {!isNew && onVisibilityChange !== undefined && visibleToModel !== undefined && (
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-2.5">
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-foreground/85">Model Visibility</p>
            <p className="text-[10px] text-muted-foreground/60">
              {lockedHidden
                ? 'This skill requires explicit invocation'
                : visibleToModel
                  ? 'Model can invoke this skill automatically'
                  : 'Hidden, use /skill:name to invoke'}
            </p>
          </div>
          <Switch
            checked={visibleToModel}
            disabled={lockedHidden}
            onCheckedChange={onVisibilityChange}
            aria-label={`Toggle model visibility for ${data.name}`}
            className="data-[state=checked]:bg-status-success"
          />
        </div>
      )}

      <div className="flex flex-1 flex-col min-h-0 px-4 py-3">
        <label htmlFor="skill-body" className="mb-1.5 text-xs font-medium text-muted-foreground">
          Skill Body
        </label>
        <textarea
          id="skill-body"
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
