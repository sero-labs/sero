import { Button } from '@sero-ai/ui';
import { RotateCw, Square } from 'lucide-react';

import type { DesignBrief, DesignRevisionFile } from '../../../shared/design';
import type { DesignVariantSummary, ItemSummary } from '../../../shared/types';

/**
 * What the run produced, and what it was made from.
 *
 * The reference list is the part that matters most: a variant is only judgeable
 * against the references it drew on, and once the Design is open there is
 * nothing else on screen that says which those were. Thumbnails are deliberately
 * absent — a preview small enough to fit here shows nothing you could recognise.
 */

/** Enough to characterise the language; more is a tag cloud. */
const VISIBLE_TAGS = 8;

export interface DesignReferenceView {
  id: string;
  title: string;
  primaryStyle: string;
  tags: string[];
  /** The Library item has been deleted; the Design still remembers it. */
  missing: boolean;
}

export function referenceViews(
  referenceItemIds: string[],
  items: ItemSummary[],
): DesignReferenceView[] {
  return referenceItemIds.map((id) => {
    const item = items.find((entry) => entry.id === id);
    return item === undefined
      ? { id, title: 'Deleted reference', primaryStyle: '', tags: [], missing: true }
      : {
          id,
          title: item.title,
          primaryStyle: item.primaryStyle,
          tags: item.tags,
          missing: false,
        };
  });
}

export interface VariantDetailProps {
  variant: DesignVariantSummary;
  /** The visible revision's files; empty until one has been produced. */
  files: DesignRevisionFile[];
  summary: string;
  brief: DesignBrief | undefined;
  references: DesignReferenceView[];
  /** The reference this variant came from, in per-reference mode. */
  ownReferenceId: string | undefined;
  onRetry(): void;
  onCancel(): void;
}

export function VariantDetail({
  variant,
  files,
  summary,
  brief,
  references,
  ownReferenceId,
  onRetry,
  onCancel,
}: VariantDetailProps) {
  const running = variant.status === 'pending' || variant.status === 'running';
  const language = [...new Set(references.flatMap((reference) => reference.tags))].slice(
    0,
    VISIBLE_TAGS,
  );

  return (
    <aside className="border-border flex w-80 shrink-0 flex-col rounded-md border">
      <div className="border-border space-y-1 border-b px-3 py-2.5">
        <p className="text-muted-foreground text-sm uppercase">
          Variant {String(variant.index + 1).padStart(2, '0')} · {variant.status}
        </p>
        <h3 className="truncate font-semibold">{variant.name ?? 'Unnamed'}</h3>
      </div>

      {/* A plain scroller rather than `ScrollArea`: that one sizes its viewport
          to its content, so a long reference title widened the whole panel
          instead of being cut short. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="divide-border divide-y">
          {variant.error !== undefined && (
            <p className="text-destructive px-3 py-2.5 text-sm">{variant.error}</p>
          )}

          {summary !== '' && (
            <Section title="Concept">
              <p className="text-muted-foreground text-sm">{summary}</p>
            </Section>
          )}

          <Section title="Inspiration" count={`${references.length} source${references.length === 1 ? '' : 's'}`}>
            <ul className="space-y-1.5">
              {references.map((reference, index) => (
                <li key={reference.id} className="flex items-baseline gap-2 text-sm">
                  <span className="text-muted-foreground tabular-nums">{index + 1}</span>
                  <span className={`min-w-0 flex-1 truncate ${reference.missing ? 'text-muted-foreground italic' : ''}`}>
                    {reference.title}
                    {reference.primaryStyle !== '' && (
                      <span className="text-muted-foreground"> · {reference.primaryStyle}</span>
                    )}
                  </span>
                  {/* Only in per-reference mode does one reference own a variant;
                      in blend mode every variant drew on all of them. */}
                  {reference.id === ownReferenceId && (
                    <span className="text-primary text-sm">this one</span>
                  )}
                </li>
              ))}
            </ul>
          </Section>

          {language.length > 0 && (
            <Section title="Applied language">
              <div className="flex flex-wrap gap-1.5">
                {language.map((tag) => (
                  <span
                    key={tag}
                    className="border-border text-muted-foreground rounded-md border px-2 py-0.5 text-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Section>
          )}

          {files.length > 0 && (
            <Section title="Files" count={String(files.length)}>
              <ul className="space-y-1 font-mono text-sm">
                {files.map((file) => (
                  <li key={file.name} className="flex items-baseline justify-between gap-2">
                    <span className="truncate">{file.name}</span>
                    <span className="text-muted-foreground shrink-0 tabular-nums">
                      {formatBytes(file.bytes)}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {brief !== undefined && (
            <Section title="Generation">
              <p className="text-muted-foreground text-sm">
                {brief.target === 'html' ? 'Web prototype' : 'React component'} ·{' '}
                {brief.inspirationStrength} influence
                {brief.variationMode === 'per-reference' ? ' · one variant per reference' : ''}
              </p>
              {variant.revisionCount > 1 && (
                <p className="text-muted-foreground text-sm tabular-nums">
                  {variant.revisionCount} revisions
                </p>
              )}
            </Section>
          )}
        </div>
      </div>

      <div className="border-border flex gap-2 border-t p-2">
        {running ? (
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>
            <Square className="size-3.5" />
            Stop
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={variant.status === 'ready'}
            onClick={onRetry}
          >
            <RotateCw className="size-3.5" />
            Try again
          </Button>
        )}
      </div>
    </aside>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h4 className="text-sm font-medium">{title}</h4>
        {count !== undefined && <span className="text-muted-foreground text-sm">{count}</span>}
      </div>
      {children}
    </section>
  );
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
