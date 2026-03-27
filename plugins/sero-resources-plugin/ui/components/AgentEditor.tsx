/**
 * AgentEditor — form for editing agent metadata + system prompt.
 */

import { useCallback } from 'react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { cn } from '@sero-ai/ui/lib/utils';
import type { AgentFileData } from './types';

interface AgentEditorProps {
  data: AgentFileData;
  isNew: boolean;
  saving: boolean;
  onSave: (data: AgentFileData) => void;
  onDelete: (name: string) => void;
  onChange: (data: AgentFileData) => void;
}

const MODELS = [
  '',
  'claude-haiku-4-5',
  'claude-sonnet-4-6',
  'claude-opus-4',
];

const THINKING_LEVELS = ['', 'off', 'low', 'medium', 'high'];

const NAME_RE = /^[a-z0-9-]*$/;

export function AgentEditor({ data, isNew, saving, onSave, onDelete, onChange }: AgentEditorProps) {
  const update = useCallback(
    (partial: Partial<AgentFileData>) => onChange({ ...data, ...partial }),
    [data, onChange],
  );

  const canSave = data.name.length > 0 && NAME_RE.test(data.name) && data.systemPrompt.length > 0;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (canSave) onSave(data);
  };

  return (
    <form onSubmit={handleSave} className="flex flex-1 flex-col min-h-0">
      {/* ── Header bar ─────────────────────────────────── */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <span className="flex-1 text-sm font-medium text-foreground truncate">
          {isNew ? 'New Agent' : data.name}
        </span>
        {!isNew && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(data.name)}
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
        <Field label="Name" hint="lowercase, hyphens only">
          <input
            type="text"
            value={data.name}
            onChange={(e) => update({ name: e.target.value })}
            disabled={!isNew}
            placeholder="my-agent"
            className={cn(fieldClass, !isNew && 'opacity-60')}
          />
        </Field>

        <Field label="Description">
          <input
            type="text"
            value={data.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="What this agent does"
            className={fieldClass}
          />
        </Field>

        <Field label="Model">
          <select
            value={data.model || ''}
            onChange={(e) => update({ model: e.target.value || undefined })}
            className={fieldClass}
          >
            {MODELS.map((m) => (
              <option key={m} value={m}>
                {m || '(default)'}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Thinking">
          <select
            value={data.thinking || ''}
            onChange={(e) => update({ thinking: e.target.value || undefined })}
            className={fieldClass}
          >
            {THINKING_LEVELS.map((t) => (
              <option key={t} value={t}>
                {t || '(default)'}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* ── System prompt ──────────────────────────────── */}
      <div className="flex flex-1 flex-col min-h-0 px-4 py-3">
        <label className="mb-1.5 text-xs font-medium text-muted-foreground">
          System Prompt
        </label>
        <textarea
          value={data.systemPrompt}
          onChange={(e) => update({ systemPrompt: e.target.value })}
          placeholder="You are a specialist agent that..."
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
