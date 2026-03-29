/**
 * CollaborationResponse — expandable display of specialist agent outputs.
 *
 * Shown below the synthesized response when collaboration mode produced the answer.
 * Each specialist's output is collapsible for transparency.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Clock3, Users } from 'lucide-react';
import { useFocusedCollaborationResult } from '@/stores/agent-selectors';
import { cn } from '@sero-ai/ui/lib/utils';
import type { CollaborationSpecialistOutput } from '@/types/collaboration';
import {
  COLLABORATION_ROLE_VISUALS,
  CollaborationRoleBadge,
} from './collaboration-visuals';

function SpecialistCard({ output }: { output: CollaborationSpecialistOutput }) {
  const [expanded, setExpanded] = useState(false);
  const visual = COLLABORATION_ROLE_VISUALS[output.role];
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border-default)] bg-[var(--bg-surface)] shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--bg-elevated)]"
      >
        <Chevron className="size-3 text-[var(--text-muted)]" />
        <CollaborationRoleBadge role={output.role} size="sm" />
        <span className="font-medium text-[var(--text-primary)]">{visual.label}</span>
        {output.error ? (
          <span className="ml-auto text-destructive">Failed</span>
        ) : (
          <span
            className={cn(
              'ml-auto inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] tabular-nums',
              visual.surface,
              visual.border,
              visual.color,
            )}
          >
            <Clock3 className="size-2.5" />
            {output.durationMs > 0 ? `${Math.round(output.durationMs / 1000)}s` : 'Done'}
          </span>
        )}
      </button>
      {expanded && (
        <div className="border-t border-[var(--border-default)] bg-[var(--bg-base)] px-3 py-2">
          {output.error ? (
            <p className="text-xs text-destructive">{output.error}</p>
          ) : (
            <div className="max-h-[min(50vh,28rem)] overflow-y-auto overscroll-contain pr-1">
              <div className="prose prose-sm max-w-none whitespace-pre-wrap break-words text-xs dark:prose-invert">
                {output.response}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Expandable specialist outputs panel.
 * Rendered below the assistant message that was produced by collaboration.
 */
export function CollaborationDetails() {
  const result = useFocusedCollaborationResult();
  const [expanded, setExpanded] = useState(false);

  if (!result) return null;

  return (
    <div className="flex shrink-0 flex-col gap-2">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex items-center gap-2 self-start rounded-md border border-[var(--collab-primary-border)] bg-[var(--collab-primary-subtle)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--collab-primary)] transition-colors hover:bg-[var(--collab-primary-muted)]"
      >
        <Users className="size-3.5" />
        {expanded ? 'Hide' : 'Show'} specialist outputs
        <span className="text-[var(--text-muted)]">
          ({Math.round(result.totalDurationMs / 1000)}s total)
        </span>
      </button>
      {expanded && (
        <div className="flex flex-col gap-1.5">
          {result.specialistOutputs.map((output) => (
            <SpecialistCard key={output.role} output={output} />
          ))}
        </div>
      )}
    </div>
  );
}
