/**
 * A folded section at the foot of the Workflow page, as the approved drawing
 * sets it: a rule above, the title, and a count at the far right.
 */

import { useState } from 'react';

interface CollapsibleSectionProps {
  title: string;
  /** Small right-aligned hint, e.g. a count ("34 runs"). */
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CollapsibleSection({ title, hint, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="flex flex-col gap-2.5 border-t border-room-line pt-2.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 text-left text-sm text-room-text2 hover:text-room-text"
      >
        {title}
        {hint && <span className="ml-auto font-mono text-[10px] text-room-text3">{hint}</span>}
      </button>
      {open && children}
    </section>
  );
}
