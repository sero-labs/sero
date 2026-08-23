import type { ReactNode } from 'react';
import { openSeroFile } from '@sero-ai/app-runtime';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@sero-ai/ui/components/ui/tooltip';
import { cn } from '@sero-ai/ui/lib/utils';

interface RoomArtifactLinkProps {
  workspaceId: string | null | undefined;
  path: string;
  children: ReactNode;
  className?: string;
}

export function RoomArtifactLink({ workspaceId, path, children, className }: RoomArtifactLinkProps) {
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
