/**
 * A titled, collapsible section for the calm single-column detail view
 * (specs/09-ui-redesign.md, B1 progressive disclosure). The header shows the
 * title, an optional count/hint, and a chevron; children render when open.
 */

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

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
    <section className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
        {title}
        {hint && <span className="ml-auto font-normal normal-case tracking-normal text-muted-foreground">{hint}</span>}
      </button>
      {open && children}
    </section>
  );
}
