/**
 * The amber ask: what a row needs the user to do, in words.
 *
 * It is the only amber wash in a list, and it always carries a sentence. A
 * count alone ("2 needs you") tells the user nothing about what to do, so the
 * approved proposal prints the ask instead: "2 members asked one question".
 */

import type { ReactNode } from 'react';
import { cn } from '@sero-ai/ui/lib/utils';

export function NeedsPill({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block rounded-md bg-status-warning/14 px-2 py-[3px] text-[11px] leading-[1.45] font-medium text-status-warning',
        className,
      )}
    >
      {children}
    </span>
  );
}
