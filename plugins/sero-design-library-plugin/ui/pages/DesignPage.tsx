import { Button } from '@sero-ai/ui';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { DesignRecord } from '../../shared/design';
import type { DesignSummary, ItemSummary } from '../../shared/types';
import { PreviewFrame } from '../components/design/PreviewFrame';
import { VariantDetail, referenceViews } from '../components/design/VariantDetail';
import { VariantTabs } from '../components/design/VariantTabs';
import type { DesignActions } from '../hooks/useDesigns';
import type { PreviewTarget } from '../hooks/usePreviewDocument';

/**
 * The Design surface: variants across the top, the live preview below, and what
 * the run produced beside it.
 *
 * The sessions rail, the tweaks panel and the viewport controls come with the
 * working surface; this is the part that has to exist for a Design to be worth
 * making at all — you can watch a variant render, read what it wrote, and retry
 * the one that failed.
 */

export interface DesignPageProps {
  design: DesignSummary;
  /** Live Library items, for naming the references this Design drew on. */
  items: ItemSummary[];
  actions: DesignActions;
  onBack(): void;
}

export function DesignPage({ design, items, actions, onBack }: DesignPageProps) {
  const [record, setRecord] = useState<DesignRecord | null>(null);
  const [activeId, setActiveId] = useState<string | undefined>(design.variants[0]?.id);

  // The record holds what the index deliberately leaves out — guardrails, file
  // lists, build warnings — so it is read on demand and re-read whenever the
  // Design changes underneath.
  useEffect(() => {
    let active = true;
    void actions.read(design.id).then((result) => {
      if (active) setRecord(result);
    });
    return () => {
      active = false;
    };
  }, [design.id, design.updatedAt, actions]);

  const active =
    design.variants.find((variant) => variant.id === activeId) ?? design.variants[0];
  const activeRecord = record?.variants.find((variant) => variant.id === active?.id);
  const revision = activeRecord?.revisions.find(
    (entry) => entry.id === activeRecord.visibleRevisionId,
  );

  const references = useMemo(
    () => referenceViews(design.referenceItemIds, items),
    [design.referenceItemIds, items],
  );

  const target: PreviewTarget | null =
    active && revision?.builtFile !== undefined
      ? {
          designId: design.id,
          variantId: active.id,
          revisionId: revision.id,
          fileName: revision.builtFile,
        }
      : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="border-border flex items-center gap-3 border-b px-4 py-2">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-3.5" />
          Library
        </Button>
        <h2 className="min-w-0 truncate text-sm font-semibold">{design.title}</h2>
        <span className="text-muted-foreground text-sm">{design.target}</span>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => {
            void actions.remove(design.id);
            onBack();
          }}
        >
          <Trash2 className="size-3.5" />
          Delete
        </Button>
      </header>

      <VariantTabs variants={design.variants} activeId={active?.id} onSelect={setActiveId} />

      {active === undefined ? (
        <p className="text-muted-foreground p-6 text-sm">This Design has no variants.</p>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 p-3">
          <PreviewFrame
            target={target}
            buildWarnings={revision?.buildWarnings ?? []}
            title={`${design.title} — ${active.name ?? `variant ${active.index + 1}`}`}
          />
          <VariantDetail
            variant={active}
            files={revision?.files ?? []}
            summary={revision?.summary ?? ''}
            brief={record?.brief}
            references={references}
            ownReferenceId={active.referenceItemId}
            onRetry={() => void actions.retryVariant(design.id, active.id)}
            onCancel={() => void actions.cancelVariant(design.id, active.id)}
          />
        </div>
      )}
    </div>
  );
}
