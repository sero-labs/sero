import { Button, ScrollArea } from '@sero-ai/ui';
import { ArrowLeft, RotateCw, Square, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { DesignRecord } from '../../shared/design';
import type { DesignSummary, DesignVariantSummary } from '../../shared/types';
import { PreviewFrame } from '../components/design/PreviewFrame';
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
  actions: DesignActions;
  onBack(): void;
}

export function DesignPage({ design, actions, onBack }: DesignPageProps) {
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
            title={`${design.title} — variant ${active.index + 1}`}
          />
          <VariantDetail
            design={design}
            variant={active}
            files={revision?.files.map((file) => `${file.name} · ${formatBytes(file.bytes)}`) ?? []}
            summary={revision?.summary ?? ''}
            actions={actions}
          />
        </div>
      )}
    </div>
  );
}

function VariantDetail({
  design,
  variant,
  files,
  summary,
  actions,
}: {
  design: DesignSummary;
  variant: DesignVariantSummary;
  files: string[];
  summary: string;
  actions: DesignActions;
}) {
  const running = variant.status === 'pending' || variant.status === 'running';

  return (
    <aside className="border-border flex w-72 shrink-0 flex-col rounded-md border">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-3">
          <div className="space-y-1">
            <p className="text-muted-foreground text-sm uppercase">
              Variant {String(variant.index + 1).padStart(2, '0')} · {variant.status}
            </p>
            {summary !== '' && <p className="text-sm">{summary}</p>}
            {variant.error !== undefined && (
              <p className="text-destructive text-sm">{variant.error}</p>
            )}
          </div>

          {files.length > 0 && (
            <section className="space-y-1">
              <h3 className="text-sm font-medium">
                Files
                <span className="text-muted-foreground ml-1.5 tabular-nums">{files.length}</span>
              </h3>
              <ul className="text-muted-foreground space-y-0.5 font-mono text-sm">
                {files.map((file) => (
                  <li key={file} className="truncate">
                    {file}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {variant.revisionCount > 1 && (
            <p className="text-muted-foreground text-sm tabular-nums">
              {variant.revisionCount} revisions
            </p>
          )}
        </div>
      </ScrollArea>

      <div className="border-border flex gap-2 border-t p-2">
        {running ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void actions.cancelVariant(design.id, variant.id)}
          >
            <Square className="size-3.5" />
            Stop
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={variant.status === 'ready'}
            onClick={() => void actions.retryVariant(design.id, variant.id)}
          >
            <RotateCw className="size-3.5" />
            Try again
          </Button>
        )}
      </div>
    </aside>
  );
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
