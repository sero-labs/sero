/**
 * CollaborationResponse — expandable display of specialist agent outputs.
 *
 * Shown below the synthesized response when collaboration mode produced the answer.
 * Each specialist's output is collapsible for transparency.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Search, BarChart3, Lightbulb, Loader2, Users } from 'lucide-react';
import {
  useFocusedCollaborationResult,
  useFocusedCollaborationSpecialists,
  useFocusedCollaborationStatus,
} from '@/stores/agent-selectors';
import { cn } from '@sero/ui/lib/utils';
import type { CollaborationRole, CollaborationSpecialistOutput } from '@/types/collaboration';

const ROLE_META: Record<CollaborationRole, { label: string; icon: typeof Search; color: string }> = {
  coordinator: { label: 'Coordinator', icon: Users, color: 'text-[var(--collab-primary)]' },
  researcher: { label: 'Researcher', icon: Search, color: 'text-[var(--status-info)]' },
  analyst: { label: 'Analyst', icon: BarChart3, color: 'text-[var(--status-success)]' },
  visionary: { label: 'Visionary', icon: Lightbulb, color: 'text-[var(--status-warning)]' },
};

function SpecialistCard({ output }: { output: CollaborationSpecialistOutput }) {
  const [expanded, setExpanded] = useState(false);
  const meta = ROLE_META[output.role];
  const Icon = meta.icon;
  const Chevron = expanded ? ChevronDown : ChevronRight;

  return (
    <div className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-[var(--bg-elevated)]"
      >
        <Chevron className="size-3 text-[var(--text-muted)]" />
        <Icon className={cn('size-3.5', meta.color)} />
        <span className="font-medium text-[var(--text-primary)]">{meta.label}</span>
        {output.error ? (
          <span className="ml-auto text-destructive">Failed</span>
        ) : (
          <span className="ml-auto text-[var(--text-muted)]">
            {output.durationMs > 0 ? `${Math.round(output.durationMs / 1000)}s` : ''}
          </span>
        )}
      </button>
      {expanded && (
        <div className="border-t border-[var(--border-default)] px-3 py-2">
          {output.error ? (
            <p className="text-xs text-destructive">{output.error}</p>
          ) : (
            <div className="max-h-[min(50vh,28rem)] overflow-y-auto overscroll-contain pr-1">
              <div className="prose prose-sm dark:prose-invert max-w-none break-words text-xs whitespace-pre-wrap">
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
 * Collaboration status indicator shown during active collaboration.
 */
export function CollaborationStatusBanner() {
  const status = useFocusedCollaborationStatus();
  const specialists = useFocusedCollaborationSpecialists();

  if (status === 'idle' || status === 'complete') return null;

  // Phase 2 runs analyst + visionary (2 agents). The researcher from phase 1
  // is already in the list, so subtract 1 to get the phase-2 completion count.
  const phase2Completed = Math.max(0, specialists.length - 1);

  return (
    <div className="mx-3 mb-2 flex items-center gap-2 rounded-md bg-[var(--collab-primary-muted)] px-3 py-2 text-xs text-[var(--collab-primary)]">
      <Loader2 className="size-3.5 animate-spin" />
      {status === 'research' && (
        <span>4-Agent Collaboration: Researcher gathering facts...</span>
      )}
      {status === 'specialists' && (
        <span>4-Agent Collaboration: Research ✓ — Analyst &amp; Visionary analyzing ({phase2Completed}/2 complete)...</span>
      )}
      {status === 'synthesis' && (
        <span>4-Agent Collaboration: Coordinator synthesizing final response...</span>
      )}
      {status === 'error' && (
        <span>4-Agent Collaboration: An error occurred</span>
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
    <div className="mx-1 mt-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] text-[var(--collab-primary)] hover:bg-[var(--collab-primary-muted)]"
      >
        <Users className="size-3" />
        {expanded ? 'Hide' : 'Show'} specialist outputs
        <span className="text-[var(--text-muted)]">
          ({Math.round(result.totalDurationMs / 1000)}s total)
        </span>
      </button>
      {expanded && (
        <div className="mt-1.5 flex flex-col gap-1.5">
          {result.specialistOutputs.map((output) => (
            <SpecialistCard key={output.role} output={output} />
          ))}
        </div>
      )}
    </div>
  );
}
