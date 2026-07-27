/**
 * Library item inspector.
 *
 * Reads as the Librarian's profile, not a form: compact sections for style,
 * vocabulary, palette, construction and guardrails. Every user-facing field is
 * still editable — a field turns into an input when you choose to edit it, and
 * an edited field shows its own reset.
 */

import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Input,
  KeyValue,
  KeyValueList,
  ScrollArea,
  Separator,
  Textarea,
} from '@sero-ai/ui';
import { Pencil, RotateCcw, X } from 'lucide-react';
import type { LibrarianUserFacingAnalysis, LibrarianVisualProfile } from '../../shared/types';

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
  onClose: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onPurge: () => void;
  deleted: boolean;
}

const CONSTRUCTION_GROUPS: Array<{ key: keyof LibrarianVisualProfile; label: string }> = [
  { key: 'typography', label: 'Typography' },
  { key: 'layout', label: 'Layout' },
  { key: 'spacingAndDensity', label: 'Density' },
  { key: 'surfaces', label: 'Surfaces' },
  { key: 'colour', label: 'Colour' },
  { key: 'shapeLanguage', label: 'Shape' },
  { key: 'imagery', label: 'Imagery' },
  { key: 'motion', label: 'Motion' },
];

export function ItemInspector(props: ItemInspectorProps) {
  const { item } = props;
  const overridden = new Set(item.overriddenFields);
  const resolved = item.resolved;
  const visual = resolved.visualProfile;

  const list = (field: keyof LibrarianUserFacingAnalysis): string[] =>
    (resolved[field] as string[] | undefined) ?? [];

  const edit = (field: keyof LibrarianUserFacingAnalysis) => ({
    field,
    overridden: overridden.has(field),
    onSave: (value: string) => props.onUpdateField(field, value),
    onReset: () => props.onResetField(field),
  });

  const editList = (field: keyof LibrarianUserFacingAnalysis) => ({
    field,
    overridden: overridden.has(field),
    onSave: (value: string) =>
      props.onUpdateField(field, value.split(',').map((part) => part.trim()).filter(Boolean)),
    onReset: () => props.onResetField(field),
  });

  return (
    <aside aria-label="Inspector" className="dl-inspector">
      <header className="dl-inspector__head">
        <span className="dl-eyebrow">
          Librarian profile
          {item.confidence !== undefined ? ` · ${Math.round(item.confidence * 100)}% confidence` : ''}
        </span>
        <div className="dl-inspector__title">
          <EditableText
            {...edit('title')}
            as="h3"
            value={String(resolved.title ?? item.originalFileName)}
          />
          <Button aria-label="Close inspector" onClick={props.onClose} size="sm" variant="ghost">
            <X aria-hidden="true" size={14} />
          </Button>
        </div>
        <p className="dl-inspector__sub">
          {item.source} · {new Date(item.createdAt).toLocaleDateString()}
        </p>
      </header>

      {item.analysisError ? (
        <p className="dl-inline-notice dl-inline-notice--warning">{item.analysisError}</p>
      ) : null}

      <ScrollArea className="dl-inspector__scroll">
        <Section title="Style" action={<Button onClick={props.onReanalyse} size="sm" variant="ghost">Reanalyse</Button>}>
          <EditableText {...edit('primaryStyle')} as="strong" value={String(resolved.primaryStyle ?? '')} />
          <EditableText {...edit('summary')} multiline value={String(resolved.summary ?? '')} />
          <EditableText {...edit('designIntent')} multiline value={String(resolved.designIntent ?? '')} />
        </Section>

        <Section title="Vocabulary" count={resolved.aestheticVocabulary?.length}>
          <div className="dl-chip-row">
            {(resolved.aestheticVocabulary ?? []).map((entry) => (
              <Badge key={entry.term} title={entry.meaning} variant="secondary">{entry.term}</Badge>
            ))}
          </div>
        </Section>

        {resolved.palette && resolved.palette.length > 0 ? (
          <Section title="Palette">
            <div className="dl-palette">
              {resolved.palette.map((colour) => (
                <span key={colour.hex} style={{ background: colour.hex }} title={`${colour.hex} · ${colour.role}`} />
              ))}
            </div>
          </Section>
        ) : null}

        <Section title="Tags">
          <EditableText {...editList('tags')} chips={list('tags')} value={list('tags').join(', ')} />
        </Section>

        {visual ? (
          <Section title="Visual construction" count={CONSTRUCTION_GROUPS.length}>
            <div className="dl-construction">
              {CONSTRUCTION_GROUPS.filter((group) => visual[group.key]?.length).map((group) => (
                <div className="dl-construction__cell" key={group.key}>
                  <b>{group.label}</b>
                  <span>{visual[group.key].join(', ')}</span>
                </div>
              ))}
            </div>
          </Section>
        ) : null}

        <Section title="Guardrails">
          <div className="dl-guardrails">
            <div className="dl-guardrail dl-guardrail--always">
              <b>Always</b>
              <EditableText {...editList('always')} multiline value={list('always').join(', ')} />
            </div>
            <div className="dl-guardrail dl-guardrail--never">
              <b>Never</b>
              <EditableText {...editList('never')} multiline value={list('never').join(', ')} />
            </div>
          </div>
        </Section>

        <Section title="Generation prompt">
          <EditableText {...edit('generationPrompt')} multiline value={String(resolved.generationPrompt ?? '')} />
        </Section>

        <Section title="Notes">
          <EditableText {...edit('notes')} multiline placeholder="Your own notes" value={String(resolved.notes ?? '')} />
        </Section>

        <Section title="Source">
          <KeyValueList>
            <KeyValue label="File" value={item.originalFileName} />
            <KeyValue label="Checksum" mono value={item.checksum?.slice(0, 12) ?? '—'} />
            <KeyValue label="Model" value={item.provenance?.modelId ?? '—'} />
          </KeyValueList>
        </Section>

        <Separator />

        <div className="dl-inspector__section dl-inspector__section--actions">
          {props.deleted ? (
            <>
              <Button onClick={props.onRestore} size="sm" variant="outline">Restore</Button>
              <Button onClick={props.onPurge} size="sm" variant="destructive">Delete permanently</Button>
            </>
          ) : (
            <Button onClick={props.onDelete} size="sm" variant="outline">Delete</Button>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function Section({
  title,
  count,
  action,
  children,
}: {
  title: string;
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="dl-inspector__section">
      <div className="dl-inspector__section-head">
        <span>{title}</span>
        {count !== undefined ? <em>{count}</em> : null}
        {action}
      </div>
      {children}
    </section>
  );
}

interface EditableTextProps {
  value: string;
  overridden: boolean;
  multiline?: boolean;
  placeholder?: string;
  as?: 'h3' | 'strong';
  chips?: string[];
  onSave: (value: string) => void;
  onReset: () => void;
}

/**
 * Reads as text until you edit it. Keeping the resting state textual is what
 * stops the inspector looking like a form.
 */
function EditableText({
  value,
  overridden,
  multiline = false,
  placeholder,
  as,
  chips,
  onSave,
  onReset,
}: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  // Reanalysis can refresh this field underneath us.
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    setEditing(false);
    if (draft !== value) onSave(draft);
  };

  if (editing) {
    return multiline ? (
      <Textarea autoFocus onBlur={commit} onChange={(event) => setDraft(event.target.value)} rows={3} value={draft} />
    ) : (
      <Input autoFocus onBlur={commit} onChange={(event) => setDraft(event.target.value)} value={draft} />
    );
  }

  const body = chips
    ? (
      <span className="dl-chip-row">
        {chips.length > 0
          ? chips.map((chip) => <Badge key={chip} variant="secondary">{chip}</Badge>)
          : <em className="dl-editable__empty">{placeholder ?? 'Not set'}</em>}
      </span>
    )
    : value.trim() !== ''
      ? <span>{value}</span>
      : <em className="dl-editable__empty">{placeholder ?? 'Not set'}</em>;

  const Tag = as ?? 'div';

  return (
    <Tag className={`dl-editable${overridden ? ' dl-editable--overridden' : ''}`}>
      {body}
      <span className="dl-editable__controls">
        <button aria-label="Edit" onClick={() => setEditing(true)} type="button">
          <Pencil aria-hidden="true" size={11} />
        </button>
        {overridden ? (
          <button aria-label="Reset to the generated value" onClick={onReset} type="button">
            <RotateCcw aria-hidden="true" size={11} />
          </button>
        ) : null}
      </span>
    </Tag>
  );
}
