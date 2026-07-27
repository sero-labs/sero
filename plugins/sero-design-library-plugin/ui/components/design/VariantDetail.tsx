import { Badge, Button, ScrollArea } from '@sero-ai/ui';
import { RotateCw, Square } from 'lucide-react';

import type { DesignBrief, DesignRevisionFile } from '../../../shared/design';
import type { DesignVariantSummary, ItemSummary } from '../../../shared/types';

/**
 * What the run produced, and what it was made from.
 *
 * Built to the reference inspector's pattern — same width, same flush left
 * border, same header, same section and field styling — because they are the
 * same kind of thing: the panel beside the work that says what the work is. Two
 * panels in one plugin that read differently is just a bug the user has to look
 * at.
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
  const context = [
    brief === undefined ? '' : brief.target === 'html' ? 'Web prototype' : 'React component',
    brief === undefined ? '' : `${brief.inspirationStrength} influence`,
    variant.revisionCount > 1 ? `${variant.revisionCount} revisions` : '',
  ].filter((part) => part !== '');

  return (
    <div className="border-border flex h-full min-h-0 w-full flex-col border-l lg:w-105 lg:shrink-0">
      <header className="border-border border-b px-4 py-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-primary text-xs font-medium tracking-wide uppercase">
              Variant {String(variant.index + 1).padStart(2, '0')} · {variant.status}
            </p>
            <h3 className="mt-1 truncate text-lg font-semibold">{variant.name ?? 'Unnamed'}</h3>
            {context.length > 0 && (
              <p className="text-muted-foreground mt-0.5 truncate text-sm">{context.join(' · ')}</p>
            )}
          </div>

          {/* Beside the title, where the reference panel keeps its actions. */}
          <div className="flex shrink-0 items-center">
            {running ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="Stop generating"
                title="Stop generating this variant"
                onClick={onCancel}
              >
                <Square className="size-4" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7"
                disabled={variant.status === 'ready'}
                aria-label="Try again"
                title="Generate this variant again"
                onClick={onRetry}
              >
                <RotateCw className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        {variant.error !== undefined && (
          <div className="border-border border-b px-4 py-3">
            <Field label="Failed">
              <p className="text-destructive text-sm wrap-break-word">{variant.error}</p>
            </Field>
          </div>
        )}

        {summary !== '' && (
          <div className="border-border border-b px-4 py-3">
            <Field label="Concept">
              <p className="text-muted-foreground text-sm leading-relaxed">{summary}</p>
            </Field>
          </div>
        )}

        <div className="border-border border-b px-4 py-3">
          <Field label="Inspiration">
            <ul className="space-y-1.5">
              {references.map((reference, index) => (
                <li key={reference.id} className="flex items-baseline gap-2 text-sm">
                  <span className="text-muted-foreground tabular-nums">{index + 1}</span>
                  <span
                    className={`min-w-0 flex-1 truncate ${
                      reference.missing ? 'text-muted-foreground italic' : 'font-medium'
                    }`}
                  >
                    {reference.title}
                    {reference.primaryStyle !== '' && (
                      <span className="text-muted-foreground font-normal">
                        {' '}
                        · {reference.primaryStyle}
                      </span>
                    )}
                  </span>
                  {/* Only in per-reference mode does one reference own a variant;
                      in blend mode every variant drew on all of them. */}
                  {reference.id === ownReferenceId && (
                    <span className="text-primary shrink-0 text-xs tracking-wide uppercase">
                      this one
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Field>
        </div>

        {language.length > 0 && (
          <div className="border-border border-b px-4 py-3">
            <Field label="Applied language">
              <div className="flex flex-wrap gap-1">
                {language.map((tag) => (
                  <Badge key={tag} variant="outline" className="font-normal">
                    {tag}
                  </Badge>
                ))}
              </div>
            </Field>
          </div>
        )}

        {files.length > 0 && (
          <div className="border-border border-b px-4 py-3 last:border-b-0">
            <Field label="Files">
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
            </Field>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

/** The inspector's field: an uppercase label with the value beneath it. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="text-muted-foreground mb-1.5 text-xs font-medium tracking-wide uppercase">
        {label}
      </h4>
      {children}
    </section>
  );
}

function formatBytes(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
