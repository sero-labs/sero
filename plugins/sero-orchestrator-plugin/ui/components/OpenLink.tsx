/** "Open →" affordance shared by the inbox cards. */

import { ArrowRight } from 'lucide-react';

export function OpenLink({ title, onClick }: { title: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
      {title} <ArrowRight className="h-3.5 w-3.5" />
    </button>
  );
}
