/**
 * Library item inspector.
 *
 * Every user-facing Librarian field is editable. An edit overrides the whole
 * field and shows its own reset; system provenance is read-only.
 */

import { useEffect, useState } from 'react';
import {
  Button,
  Input,
  KeyValue,
  KeyValueList,
  Label,
  ScrollArea,
  Separator,
  Textarea,
} from '@sero-ai/ui';
import { RotateCcw } from 'lucide-react';
import type { LibrarianUserFacingAnalysis } from '../../shared/types';

export interface ResolvedItem {
  id: string;
  source: string;
  createdAt: number;
  originalFileName: string;
  analysisStatus: string;
  analysisError?: string;
  checksum?: string;
  byteLength?: number;
  confidence?: number;
  provenance?: { modelId?: string; providerId?: string; analysedAt?: number; promptVersion?: number };
  overriddenFields: string[];
  resolved: Partial<LibrarianUserFacingAnalysis>;
}

export interface ItemInspectorProps {
  item: ResolvedItem;
  onUpdateField: (field: string, value: unknown) => void;
  onResetField: (field: string) => void;
  onReanalyse: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onPurge: () => void;
  deleted: boolean;
}

const TEXT_FIELDS: Array<{ field: keyof LibrarianUserFacingAnalysis; label: string; multiline?: boolean }> = [
  { field: 'title', label: 'Title' },
  { field: 'primaryStyle', label: 'Primary style' },
  { field: 'summary', label: 'Summary', multiline: true },
  { field: 'designIntent', label: 'Intent', multiline: true },
  { field: 'notes', label: 'Notes', multiline: true },
  { field: 'generationPrompt', label: 'Generation prompt', multiline: true },
];

const LIST_FIELDS: Array<{ field: keyof LibrarianUserFacingAnalysis; label: string }> = [
  { field: 'tags', label: 'Tags' },
  { field: 'designTypes', label: 'Design types' },
  { field: 'always', label: 'Always' },
  { field: 'never', label: 'Never' },
];

export function ItemInspector(props: ItemInspectorProps) {
  const { item } = props;
  const overridden = new Set(item.overriddenFields);

  return (
    <aside aria-label="Inspector" className="dl-inspector">
      <header className="dl-inspector__head">
        <div>
          <strong>{String(item.resolved.title ?? item.originalFileName)}</strong>
          <p className="dl-eyebrow">{item.analysisStatus}</p>
        </div>
        <Button onClick={props.onReanalyse} size="sm" variant="outline">Reanalyse</Button>
      </header>

      {item.analysisError ? (
        <p className="dl-inline-notice dl-inline-notice--warning">{item.analysisError}</p>
      ) : null}

      <ScrollArea className="dl-inspector__scroll">
      <section className="dl-inspector__section">
        {TEXT_FIELDS.map((entry) => (
          <FieldEditor
            key={entry.field}
            label={entry.label}
            multiline={entry.multiline === true}
            onReset={() => props.onResetField(entry.field)}
            onSave={(value) => props.onUpdateField(entry.field, value)}
            overridden={overridden.has(entry.field)}
            value={String(item.resolved[entry.field] ?? '')}
          />
        ))}

        {LIST_FIELDS.map((entry) => (
          <FieldEditor
            key={entry.field}
            label={entry.label}
            multiline
            onReset={() => props.onResetField(entry.field)}
            onSave={(value) => props.onUpdateField(
              entry.field,
              value.split(',').map((part) => part.trim()).filter(Boolean),
            )}
            overridden={overridden.has(entry.field)}
            value={(item.resolved[entry.field] as string[] | undefined)?.join(', ') ?? ''}
          />
        ))}
      </section>

      <Separator />

      <section className="dl-inspector__section">
        <span className="dl-eyebrow">Provenance</span>
        <KeyValueList>
          <KeyValue label="Source" value={item.source} />
          <KeyValue label="File" value={item.originalFileName} />
          <KeyValue label="Checksum" mono value={item.checksum?.slice(0, 16) ?? '—'} />
          <KeyValue label="Model" value={item.provenance?.modelId ?? '—'} />
          <KeyValue
            label="Confidence"
            mono
            value={item.confidence !== undefined ? item.confidence.toFixed(2) : '—'}
          />
        </KeyValueList>
      </section>

      <Separator />

      <section className="dl-inspector__section dl-inspector__section--actions">
        {props.deleted ? (
          <>
            <Button onClick={props.onRestore} size="sm" variant="outline">Restore</Button>
            <Button onClick={props.onPurge} size="sm" variant="destructive">Delete permanently</Button>
          </>
        ) : (
          <Button onClick={props.onDelete} size="sm" variant="outline">Delete</Button>
        )}
      </section>
      </ScrollArea>
    </aside>
  );
}

interface FieldEditorProps {
  label: string;
  value: string;
  overridden: boolean;
  multiline: boolean;
  onSave: (value: string) => void;
  onReset: () => void;
}

function FieldEditor({ label, value, overridden, multiline, onSave, onReset }: FieldEditorProps) {
  const [draft, setDraft] = useState(value);

  // Keep the editor in step with a reanalysis that refreshed this field.
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    if (draft !== value) onSave(draft);
  };

  return (
    <div className="dl-field">
      <div className="dl-field__label">
        <Label htmlFor={`field-${label}`}>{label}</Label>
        {overridden ? (
          <Button
            aria-label={`Reset ${label}`}
            className="dl-field__reset"
            onClick={onReset}
            size="sm"
            variant="ghost"
          >
            <RotateCcw aria-hidden="true" size={12} />
            Reset
          </Button>
        ) : null}
      </div>
      {multiline ? (
        <Textarea
          id={`field-${label}`}
          onBlur={commit}
          onChange={(event) => setDraft(event.target.value)}
          rows={2}
          value={draft}
        />
      ) : (
        <Input
          id={`field-${label}`}
          onBlur={commit}
          onChange={(event) => setDraft(event.target.value)}
          value={draft}
        />
      )}
    </div>
  );
}
