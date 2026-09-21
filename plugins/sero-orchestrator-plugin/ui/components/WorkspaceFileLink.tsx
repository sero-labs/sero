/**
 * A file named on the page, as a control that opens it.
 *
 * One component for every place a Workflow or a Room names a file, so the
 * pointer, the dotted underline and the tooltip cannot differ between them. A
 * value the host cannot open is shown WITHOUT a control by the caller, not as a
 * disabled one here.
 */

import type { ReactNode } from 'react';
import { openSeroFile } from '@sero-ai/app-runtime';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@sero-ai/ui/components/ui/tooltip';
import { cn } from '@sero-ai/ui/lib/utils';

interface WorkspaceFileLinkProps {
  workspaceId: string | null | undefined;
  path: string;
  children: ReactNode;
  className?: string;
}

export function WorkspaceFileLink({ workspaceId, path, children, className }: WorkspaceFileLinkProps) {
  return (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            disabled={!workspaceId}
            onClick={() => workspaceId && void openSeroFile(workspaceId, path)}
            className={cn('group min-w-0 text-left enabled:cursor-pointer disabled:cursor-default', className)}
          >
            {children}
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[min(36rem,calc(100vw-2rem))] break-all text-left" sideOffset={6}>
          {path}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
