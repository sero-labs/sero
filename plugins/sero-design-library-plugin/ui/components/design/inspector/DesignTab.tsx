import { Badge, ScrollArea } from '@sero-ai/ui';

import type { DesignReferenceView } from '../references';
import { Block, Field } from './Field';

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

export interface DesignTabProps {
  summary: string;
  error: string | undefined;
  references: DesignReferenceView[];
  /** The reference this variant came from, in per-reference mode. */
  ownReferenceId: string | undefined;
}

export function DesignTab({ summary, error, references, ownReferenceId }: DesignTabProps) {
  const language = [...new Set(references.flatMap((reference) => reference.tags))].slice(
    0,
    VISIBLE_TAGS,
  );

  return (
    <ScrollArea className="min-h-0 flex-1">
      {error !== undefined && (
        <Block>
          <Field label="Failed">
            <p className="text-destructive text-sm wrap-break-word">{error}</p>
          </Field>
        </Block>
      )}

      {summary !== '' && (
        <Block>
          <Field label="Concept">
            <p className="text-muted-foreground text-sm leading-relaxed">{summary}</p>
          </Field>
        </Block>
      )}

      <Block>
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
      </Block>

      {language.length > 0 && (
        <Block>
          <Field label="Applied language">
            <div className="flex flex-wrap gap-1">
              {language.map((tag) => (
                <Badge key={tag} variant="outline" className="font-normal">
                  {tag}
                </Badge>
              ))}
            </div>
          </Field>
        </Block>
      )}
    </ScrollArea>
  );
}
