import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@sero-ai/ui/components/ui/context-menu';
import type { BranchInfo } from '../../shared/types';

interface BranchContextMenuProps {
  branch: BranchInfo;
  onCheckout?: () => void;
  onDelete?: () => void;
  onForceDelete?: () => void;
  onRemoveWorktree?: () => void;
  onForceRemoveWorktree?: () => void;
  children: React.ReactNode;
}

export function BranchContextMenu({
  branch,
  onCheckout,
  onDelete,
  onForceDelete,
  onRemoveWorktree,
  onForceRemoveWorktree,
  children,
}: BranchContextMenuProps) {
  const hasBranchActions = Boolean(onCheckout || onDelete || onForceDelete);
  const hasWorktreeActions = Boolean(onRemoveWorktree || onForceRemoveWorktree);

  if (!hasBranchActions && !hasWorktreeActions) return <>{children}</>;

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="w-full">{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <div className="px-3 py-1.5 text-sm uppercase tracking-wider text-[var(--text-muted)] git-mono">
          {branch.name}
        </div>
        {branch.checkedOutIn && (
          <div className="px-3 pb-1.5 text-sm text-[var(--text-muted)] git-mono">
            {branch.checkedOutIn}
          </div>
        )}

        {onCheckout && (
          <ContextMenuItem onSelect={onCheckout}>
            Switch to branch
          </ContextMenuItem>
        )}

        {(onDelete || onForceDelete) && (
          <>
            {onCheckout && <ContextMenuSeparator />}
            {onDelete && (
              <ContextMenuItem onSelect={onDelete}>
                Delete branch
              </ContextMenuItem>
            )}
            {onForceDelete && (
              <ContextMenuItem variant="destructive" onSelect={onForceDelete}>
                Force delete branch
              </ContextMenuItem>
            )}
          </>
        )}

        {(onRemoveWorktree || onForceRemoveWorktree) && (
          <>
            {hasBranchActions && <ContextMenuSeparator />}
            {onRemoveWorktree && (
              <ContextMenuItem onSelect={onRemoveWorktree}>
                Remove worktree
              </ContextMenuItem>
            )}
            {onForceRemoveWorktree && (
              <ContextMenuItem variant="destructive" onSelect={onForceRemoveWorktree}>
                Force remove worktree
              </ContextMenuItem>
            )}
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
