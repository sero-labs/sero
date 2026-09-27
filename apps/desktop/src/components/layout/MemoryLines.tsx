import { useId, useState } from 'react';
import { Brain, ChevronRight } from 'lucide-react';
import { cn } from '@sero-ai/ui/lib/utils';
import type { ChatRecalledMemory, ChatToolCallMessage } from '@/types/ipc';
import { MemoryText } from './MemoryText';
import { readMemoryChange, type MemoryChange } from './tool-call-helpers/memory-change';

/**
 * Memory in the transcript (design D13): one line for the memories recalled
 * for a message, and one line for each save, replace or remove.
 */

const CHANGE_LABELS: Record<MemoryChange['action'], string> = {
  save: 'Saved:',
  replace: 'Replaced:',
  remove: 'Removed:',
};

export function MemoryRecallLine({ memories }: { memories: ChatRecalledMemory[] }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const label = `Recalled ${memories.length} ${memories.length === 1 ? 'memory' : 'memories'}`;

  return (
    <div className="grid gap-1">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded((open) => !open)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setExpanded(false);
        }}
        className="group/recall flex w-fit items-center gap-2 py-1 pr-1.5 text-left text-xs text-[var(--text-muted)]"
      >
        <ChevronRight
          className={cn(
            'size-3.5 transition-transform duration-150 motion-reduce:transition-none',
            expanded && 'rotate-90',
          )}
        />
        <Brain className="size-3.5 text-[var(--accent-primary)]" />
        <span className="font-medium text-[var(--text-secondary)] group-hover/recall:text-[var(--text-primary)]">
          {label}
        </span>
      </button>
      <ul
        id={listId}
        hidden={!expanded}
        className="ml-1.5 grid gap-2 border-l border-[var(--border-subtle)] pt-0.5 pb-1 pl-3"
      >
        {memories.map((memory) => (
          <li key={memory.id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs">
            <span className="text-[var(--text-secondary)]"><MemoryText text={memory.fact} /></span>
            <span className="font-mono text-[var(--text-muted)]">{memory.id}</span>
            {memory.behaviour ? (
              <span className="text-[var(--text-muted)]">Behaviour: <MemoryText text={memory.behaviour} /></span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MemoryChangeLine({ change }: { change: MemoryChange }) {
  return (
    <div className="flex items-start gap-2 py-1 text-xs text-[var(--text-muted)]">
      <Brain className="mt-px size-3.5 shrink-0 text-[var(--accent-primary)]" />
      <span className="shrink-0 font-medium text-[var(--text-secondary)]">{CHANGE_LABELS[change.action]}</span>
      <span className={cn('min-w-0', change.action === 'remove' && 'line-through decoration-[var(--border-default)]')}>
        <MemoryText text={change.fact} />
      </span>
    </div>
  );
}

/** A finished `sero memory` save, replace or remove as one line; any other tool draws nothing here. */
export function MemoryToolLine({ tool }: { tool: ChatToolCallMessage }) {
  const change = readMemoryChange(tool);
  return change ? <MemoryChangeLine change={change} /> : null;
}
