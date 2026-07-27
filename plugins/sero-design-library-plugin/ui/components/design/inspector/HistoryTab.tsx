import { Button, ScrollArea } from '@sero-ai/ui';
import { Check } from 'lucide-react';

import type { DesignRevision } from '../../../../shared/design';
import type { TweakCheckpoint } from '../../../../shared/tweaks';
import { relativeTime } from '../../../lib/time';
import { Block, Field } from './Field';

/**
 * Everything this variant has been (spec §6.4, §6.5).
 *
 * Two kinds of history sit here because they are the same question asked at
 * different scales: which generated result is on screen, and what the controls
 * over it were set to. Both are recoverable, which is what makes replacing a
 * result and resetting a panel safe things to do.
 *
 * Revisions are never destroyed by revising — the pointer moves, the list keeps
 * growing — so the newest is simply first. One a replace stood in for is marked
 * rather than removed: that is what makes replacing recoverable.
 */

export interface HistoryTabProps {
  /** Every revision the variant has, newest first. */
  revisions: DesignRevision[];
  visibleRevisionId: string | undefined;
  /** Checkpoints for the revision on screen; other revisions keep their own. */
  checkpoints: TweakCheckpoint[];
  onSelectRevision(revisionId: string): void;
  onRestoreCheckpoint(checkpointId: string): void;
}

export function HistoryTab({
  revisions,
  visibleRevisionId,
  checkpoints,
  onSelectRevision,
  onRestoreCheckpoint,
}: HistoryTabProps) {
  const ordered = revisions;
  const now = Date.now();

  if (ordered.length === 0) {
    return <p className="text-muted-foreground px-4 py-3 text-sm">Nothing has been generated yet.</p>;
  }

  return (
    <ScrollArea className="min-h-0 flex-1">
      <Block>
        <Field label="Revisions">
          <ul className="space-y-1">
            {ordered.map((revision, index) => {
              const visible = revision.id === visibleRevisionId;
              return (
                <li key={revision.id}>
                  <button
                    type="button"
                    className={`hover:bg-muted/60 flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                      visible ? 'bg-muted/60' : ''
                    }`}
                    aria-current={visible}
                    onClick={() => onSelectRevision(revision.id)}
                  >
                    <span className="text-muted-foreground tabular-nums">
                      {ordered.length - index}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {revision.name === '' ? 'Unnamed revision' : revision.name}
                      </span>
                      <span className="text-muted-foreground block truncate">
                        {relativeTime(revision.createdAt, now)}
                        {revision.builtFile === undefined ? ' · did not build' : ''}
                        {revision.supersededAt === undefined ? '' : ' · replaced'}
                      </span>
                    </span>
                    {visible && <Check className="text-primary size-3.5 shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </Field>
      </Block>

      {checkpoints.length > 0 && (
        <Block>
          <Field label="Earlier tweak values">
            <ul className="space-y-1">
              {/* Newest first, as the revisions are: the one you most likely
                  want back is the one you just left. */}
              {checkpoints.toReversed().map((checkpoint) => (
                <li key={checkpoint.id} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground min-w-0 flex-1 truncate">
                    {relativeTime(checkpoint.at, now)} ·{' '}
                    {countOf(Object.keys(checkpoint.overrides).length)}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onRestoreCheckpoint(checkpoint.id)}
                  >
                    Restore
                  </Button>
                </li>
              ))}
            </ul>
          </Field>
        </Block>
      )}
    </ScrollArea>
  );
}

function countOf(count: number): string {
  return count === 0 ? 'defaults' : `${count} control${count === 1 ? '' : 's'} edited`;
}
