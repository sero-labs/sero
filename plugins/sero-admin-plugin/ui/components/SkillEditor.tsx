/**
 * SkillEditor, form for editing skill metadata + SKILL.md body.
 * Includes a visibility toggle (merged from Admin's SkillsPanel).
 */

import { useCallback } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { SkillFileData } from './types';
import type { SkillEntry } from '../lib/skill-catalogue';
import { SkillEditorHeader } from './SkillEditorHeader';
import { SkillNotes } from './SkillNotes';
import { SkillVisibilityRow } from './SkillVisibilityRow';

interface SkillEditorProps {
  data: SkillFileData;
  isNew: boolean;
  saving: boolean;
  /** The catalogue entry of the selected skill. Null for a new skill, which is always yours. */
  entry: SkillEntry | null;
  /** Where the skill comes from, for the badge and notes: Yours, a plugin name or a project name. */
  originName: string;
  /** Set when another skill with the same name is involved. */
  duplicate: { lead: string; text: string } | null;
  /** True when a same-name skill wins, so this one is never loaded. */
  notUsed: boolean;
  visibleToModel?: boolean;
  lockedHidden?: boolean;
  onVisibilityChange?: (visible: boolean) => void;
  onSave: (data: SkillFileData) => void;
  onDelete: (filePath: string) => void;
  onChange: (data: SkillFileData) => void;
}

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

export function SkillEditor({
  data, isNew, saving, entry, originName, duplicate, notUsed,
  visibleToModel, lockedHidden, onVisibilityChange,
  onSave, onDelete, onChange,
}: SkillEditorProps) {
  const update = useCallback(
    (partial: Partial<SkillFileData>) => onChange({ ...data, ...partial }),
    [data, onChange],
  );

  const canSave = data.name.length > 0 && NAME_RE.test(data.name) && data.body.length > 0;
  const scope = entry?.scope ?? 'user';
  // A plugin's skill belongs to the plugin. A project's skill is a file in that project.
  const editable = scope !== 'plugin';

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSave) onSave(data);
  };

  return (
    <form onSubmit={handleSave} className="flex flex-1 flex-col min-h-0">
      <SkillEditorHeader
        title={isNew ? 'New Skill' : data.name}
        scope={scope}
        originName={originName}
        saving={saving}
        canSave={canSave}
        deletePath={!isNew && scope === 'user' ? data.filePath : undefined}
        onDelete={onDelete}
      />

      <SkillNotes scope={scope} originName={originName} duplicate={duplicate} />

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
            readOnly={!editable}
            placeholder="What this skill does"
            className={fieldClass}
          />
        </Field>
      </div>

      {!isNew && onVisibilityChange !== undefined && visibleToModel !== undefined && (
        <SkillVisibilityRow
          name={data.name}
          visibleToModel={visibleToModel}
          lockedHidden={lockedHidden ?? false}
          notUsed={notUsed}
          onChange={onVisibilityChange}
        />
      )}

      <div className="flex flex-1 flex-col min-h-0 px-4 py-3">
        <label htmlFor="skill-body" className="mb-1.5 text-xs font-medium text-muted-foreground">
          Skill Body
        </label>
        <textarea
          id="skill-body"
          value={data.body}
          onChange={(e) => update({ body: e.target.value })}
          readOnly={!editable}
          placeholder="# My Skill&#10;&#10;Instructions for the agent when this skill is active..."
          className={cn(
            'flex-1 min-h-0 resize-none rounded-md border border-input bg-background',
            'px-3 py-2 text-base text-foreground font-mono leading-relaxed',
            'placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring',
          )}
        />
      </div>
    </form>
  );
}

const fieldClass = cn(
  'w-full rounded-md border border-input bg-background',
  'px-2.5 py-1.5 text-base text-foreground',
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
