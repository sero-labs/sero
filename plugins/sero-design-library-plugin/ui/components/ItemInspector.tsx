import { Button, ScrollArea } from '@sero-ai/ui';
import { TriangleAlert } from 'lucide-react';

import type { LibrarianField } from '../../shared/librarian';
import type { ItemSummary } from '../../shared/types';
import type { LibraryActions } from '../hooks/useLibrary';
import { useItemDetail, type ItemDetail } from '../hooks/useItemDetail';
import { capabilityLabel } from '../lib/asset-view';
import { EditableField, type FieldTone } from './inspector/EditableField';
import { FieldValue } from './inspector/FieldValue';
import { InspectorHeader } from './inspector/InspectorHeader';

/**
 * The reference inspector.
 *
 * No image: the grid card already showed it, and the panel's job is the
 * Librarian's reading of it. Giving the space to the analysis is what lets the
 * whole profile be scanned without scrolling past a thumbnail first — the
 * prototype's arrangement, and the reason it fits.
 *
 * Fields are grouped the way the prototype groups them, but every one keeps
 * its own pencil and its own reset, because an override covers exactly one
 * field (spec §5.4).
 */

interface FieldSpec {
  field: LibrarianField;
  label?: string;
  tone?: FieldTone;
}

interface SectionSpec {
  /** Shown above the group when it holds more than one field. */
  heading?: string;
  fields: FieldSpec[];
}

const SECTIONS: SectionSpec[] = [
  { fields: [{ field: 'title' }] },
  { heading: 'Style', fields: [{ field: 'primaryStyle', label: 'Primary style' }, { field: 'summary' }] },
  { fields: [{ field: 'designIntent', label: 'Design intent' }] },
  { fields: [{ field: 'designTypes', label: 'Design types' }] },
  { fields: [{ field: 'tags' }] },
  { fields: [{ field: 'aestheticVocabulary', label: 'Vocabulary' }] },
  { fields: [{ field: 'palette' }] },
  { fields: [{ field: 'visualProfile', label: 'Visual construction' }] },
  {
    heading: 'Guardrails',
    fields: [
      { field: 'always', tone: 'positive' },
      { field: 'never', tone: 'negative' },
    ],
  },
  { fields: [{ field: 'generationPrompt', label: 'Generation prompt' }] },
  { fields: [{ field: 'notes' }] },
];

interface ItemInspectorProps {
  item: ItemSummary;
  revision: number;
  actions: LibraryActions;
  onClose(): void;
}

function Sections({
  detail,
  itemId,
  actions,
}: {
  detail: ItemDetail;
  itemId: string;
  actions: LibraryActions;
}) {
  // Consulted once per field, so it is a Set rather than a repeated scan.
  const overridden = new Set(detail.overridden);
  return (
    <>
      {SECTIONS.map((section) => (
        <div
          key={section.heading ?? section.fields[0].field}
          className="border-border space-y-3 border-b px-4 py-3 last:border-b-0"
        >
          {section.heading && <h3 className="text-sm font-medium">{section.heading}</h3>}
          {section.fields.map(({ field, label, tone }) => (
            <EditableField
              key={field}
              field={field}
              value={detail.analysis[field]}
              overridden={overridden.has(field)}
              {...(label === undefined ? {} : { label })}
              {...(tone === undefined ? {} : { tone })}
              onSave={(value) => void actions.setField(itemId, field, value)}
              onReset={() => void actions.resetField(itemId, field)}
            >
              <FieldValue field={field} value={detail.analysis[field]} />
            </EditableField>
          ))}
        </div>
      ))}
      {detail.generation && (
        <section className="border-border space-y-3 border-b px-4 py-3 last:border-b-0">
          <h3 className="text-sm font-medium">Original request</h3>
          <div>
            <p className="text-muted-foreground text-xs">Prompt</p>
            <p className="mt-1 wrap-break-word text-sm whitespace-pre-wrap">
              {detail.generation.prompt || 'No prompt'}
            </p>
          </div>
          <dl className="text-muted-foreground grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            <dt>Operation</dt>
            <dd className="text-foreground">{capabilityLabel(detail.generation.capability)}</dd>
            <dt>Model</dt>
            <dd className="text-foreground wrap-break-word">{detail.generation.model}</dd>
          </dl>
        </section>
      )}
    </>
  );
}

export function ItemInspector({ item, revision, actions, onClose }: ItemInspectorProps) {
  const detail = useItemDetail(item.id, revision);
  const analysing = item.analysisStatus === 'running' || item.analysisStatus === 'pending';

  return (
    <div className="border-border flex h-full min-h-0 w-full flex-col border-l lg:w-105 lg:shrink-0">
      <InspectorHeader
        item={item}
        confidence={detail?.confidence ?? 0}
        designTypes={detail?.analysis.designTypes ?? []}
        updatedAt={detail?.updatedAt ?? 0}
        analysing={analysing}
        onFavourite={() => void actions.favourite(item.id, !item.favourite)}
        onReanalyse={() =>
          void (analysing ? actions.cancelAnalysis(item.id) : actions.reanalyse(item.id))
        }
        onDelete={() => {
          void actions.remove(item.id);
          onClose();
        }}
        onClose={onClose}
      />

      {item.analysisStatus === 'failed' && (
        <div className="border-border flex items-start gap-2 border-b px-4 py-2 text-sm">
          <TriangleAlert className="text-destructive mt-0.5 size-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-destructive">Analysis failed</p>
            {/* The reason, verbatim. A failure that will not say why is a
                failure the user can only respond to by clicking Retry and
                hoping, which is what this replaces. */}
            {item.analysisError && (
              <p className="text-muted-foreground mt-0.5 wrap-break-word">{item.analysisError}</p>
            )}
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => void actions.reanalyse(item.id)}>
            Retry
          </Button>
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        {detail === null ? (
          <p className="text-muted-foreground p-4 text-sm">
            {analysing ? 'The Librarian is reading this reference…' : 'Loading analysis…'}
          </p>
        ) : (
          <Sections detail={detail} itemId={item.id} actions={actions} />
        )}
      </ScrollArea>
    </div>
  );
}
