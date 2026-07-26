/**
 * Switching branch with uncommitted changes — the only dialog in the app,
 * because it is the only action that can destroy work (rule 24, §7).
 *
 * Three named outcomes, each saying what happens to the changes rather than
 * what git calls it.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@sero-ai/ui/components/ui/dialog';

export type SwitchStrategy = 'bring' | 'stash' | 'discard';

interface Props {
  /** The branch being switched to; null closes the dialog. */
  branch: string | null;
  /** Where the changes are now. */
  currentBranch: string;
  changedFiles: number;
  onChoose: (strategy: SwitchStrategy) => void;
  onCancel: () => void;
}

export function SwitchBranchDialog({
  branch, currentBranch, changedFiles, onChoose, onCancel,
}: Props) {
  if (!branch) return null;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Switch to {branch} with {changedFiles} uncommitted{' '}
            {changedFiles === 1 ? 'change' : 'changes'}?
          </DialogTitle>
          <DialogDescription>
            Choose what happens to the work in your working tree.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Choice
            label="Bring them along"
            detail={`Your changes move to ${branch}. This is what git does when nothing conflicts.`}
            primary
            onClick={() => onChoose('bring')}
          />
          <Choice
            label="Stash first"
            detail={`Your changes are stashed and stay behind on ${currentBranch}. Restore them from the rail.`}
            onClick={() => onChoose('stash')}
          />
          <Choice
            label="Discard them"
            detail="Your changes are thrown away. This cannot be undone."
            destructive
            onClick={() => onChoose('discard')}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Choice({
  label, detail, onClick, primary, destructive,
}: {
  label: string;
  detail: string;
  onClick: () => void;
  primary?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${
        primary
          ? 'border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 hover:bg-[var(--brand-primary)]/20'
          : destructive
            ? 'border-[var(--border-subtle)] hover:border-[var(--status-error-border)] hover:bg-[var(--status-error-faint)]'
            : 'border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)]'
      }`}
    >
      <span className={`block text-[0.84rem] font-medium ${
        destructive ? 'text-[var(--status-error)]' : 'text-[var(--text-primary)]'
      }`}>
        {label}
      </span>
      <span className="mt-0.5 block text-xs leading-relaxed text-[var(--text-muted)]">
        {detail}
      </span>
    </button>
  );
}
