import type { ReactNode } from 'react';
import { openSeroFile } from '@sero-ai/app-runtime';
import { cn } from '@sero-ai/ui/lib/utils';

interface RoomArtifactLinkProps {
  workspaceId: string | null | undefined;
  path: string;
  children: ReactNode;
  className?: string;
}

export function RoomArtifactLink({ workspaceId, path, children, className }: RoomArtifactLinkProps) {
  return (
    <button
      type="button"
      disabled={!workspaceId}
      onClick={() => workspaceId && void openSeroFile(workspaceId, path)}
      className={cn('min-w-0 text-left enabled:cursor-pointer disabled:cursor-default', className)}
    >
      {children}
    </button>
  );
}
