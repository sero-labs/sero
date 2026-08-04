import { Button, Input, Textarea } from '@sero-ai/ui';
import { Pencil, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import type { LibrarianField, LibrarianUserFacingAnalysis } from '../../../shared/librarian';
import {
  FIELD_HINTS,
  FIELD_LABELS,
  FIELD_SHAPES,
  decodeField,
  encodeField,
} from '../../lib/field-codecs';

/**
 * One analysis field, with the whole override contract attached.
 *
 * Editing overrides the entire field; Reset removes that override so the
 * generated value shows through again. Reset is offered only when an override
 * exists, which is also the honest signal that the field is manual — the
 * marker tracks *presence* of an override rather than whether the value
 * happens to differ (spec §5.4).
 */

export type FieldTone = 'default' | 'positive' | 'negative';

const TONE_CLASS: Record<FieldTone, string> = {
  default: '',
  positive: 'border-l-2 border-l-primary pl-3',
  negative: 'border-l-2 border-l-destructive pl-3',
};

interface EditableFieldProps {
  field: LibrarianField;
  value: LibrarianUserFacingAnalysis[LibrarianField];
  overridden: boolean;
  children: React.ReactNode;
  /** Overrides the default field name, for fields shown under a shared heading. */
  label?: string;
  tone?: FieldTone;
  onSave(value: LibrarianUserFacingAnalysis[LibrarianField]): void;
  onReset(): void;
}

export function EditableField({
  field,
  value,
  overridden,
  children,
  label,
  tone = 'default',
  onSave,
  onReset,
}: EditableFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null;
  const shape = FIELD_SHAPES[field];
  const hint = FIELD_HINTS[field];
  const heading = label ?? FIELD_LABELS[field];

  const save = () => {
    if (draft !== null) onSave(decodeField(field, draft));
    setDraft(null);
  };

  return (
    <section className={`group/field ${TONE_CLASS[tone]}`}>
      <header className="mb-1.5 flex items-center gap-2">
        <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {heading}
        </h4>
        {overridden && <span className="text-muted-foreground text-xs">· edited</span>}
        <div className="ml-auto flex items-center gap-0.5">
          {overridden && !editing && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-6 opacity-0 group-hover/field:opacity-100 focus-visible:opacity-100"
              aria-label={`Reset ${heading}`}
              title="Restore the Librarian's value"
              onClick={onReset}
            >
              <RotateCcw className="size-3.5" />
            </Button>
          )}
          {!editing && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="text-muted-foreground size-6 opacity-0 group-hover/field:opacity-100 focus-visible:opacity-100"
              aria-label={`Edit ${heading}`}
              onClick={() => setDraft(encodeField(field, value))}
            >
              <Pencil className="size-3.5" />
            </Button>
          )}
        </div>
      </header>

      {editing ? (
        <div className="space-y-2">
          {shape === 'line' ? (
            <Input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} />
          ) : (
            <Textarea
              autoFocus
              rows={shape === 'paragraph' ? 5 : 6}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          )}
          {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={save}>
              Save
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        children
      )}
    </section>
  );
}
