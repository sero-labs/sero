/**
 * The eye and its pop-up block for a one-answer call shown in a button row.
 *
 * Reflect and Skill sit in the Workflow's top bar, where a block in the row
 * would push the other controls around. The block therefore opens above them,
 * and Escape closes it — the reader must be able to dismiss it without hunting
 * for the control again.
 */

import { useEffect, useState } from 'react';
import { SubagentLiveBlock } from '@sero-ai/ui/components/live-agent/live-block';
import { Eye } from 'lucide-react';

export function LiveCallPopover({ runId, label, busy = false }: {
  runId: string;
  /** What the control it sits beside says, e.g. `Reflecting…`. */
  label: string;
  /** Shown dimmed while the call has not answered yet. */
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className={`grid size-6 shrink-0 place-items-center rounded-[5px] text-room-text3 hover:bg-room-overlay hover:text-room-text${open ? ' bg-room-overlay text-room-text' : ''}`}
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-expanded={open}
        aria-label={`Watch the agent for ${label}`}
        title="Watch the agent"
      >
        <Eye className="size-3.5" />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={`${label} live reply`}
          className="absolute right-0 top-full z-50 mt-1 w-[30rem] max-w-[70vw]"
        >
          <SubagentLiveBlock runId={runId} monospace className={busy ? 'opacity-90' : undefined} />
        </div>
      )}
    </span>
  );
}
