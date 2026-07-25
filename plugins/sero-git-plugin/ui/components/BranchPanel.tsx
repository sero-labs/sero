/**
 * Left sidebar, branches, remotes, stashes.
 */

import { useMemo, useState } from 'react';

import type { BranchInfo, GitManagerRequest, RemoteInfo, StashEntry } from '../../shared/types';
import { canDeleteBranch } from '../lib/branch-actions';
import {
  formatBranchLabel,
  groupRemoteBranches,
  sortBranchesForDisplay,
} from '../lib/branch-groups';
import { BranchContextMenu } from './BranchContextMenu';
import {
  CreateBranchForm,
  RemoteBranchGroup,
  Section,
  SectionActionButton,
} from './BranchPanelSections';
import { BranchRow, PositionRow, StashRow } from './BranchPanelRows';
import type { RepoMode } from '../lib/repo-mode';

interface BranchPanelProps {
  branches: BranchInfo[];
  remoteBranches: BranchInfo[];
  remotes: RemoteInfo[];
  stashes: StashEntry[];
  currentBranch: string;
  defaultBranch?: string;
  onAction: (action: GitManagerRequest) => void;
  /** Lane colours from the graph, so a branch reads the same in both (§3). */
  branchColours?: Record<string, string>;
  /** Which hard state the repo is in — the rail always says where you are (§7). */
  mode: RepoMode;
  /** The commit HEAD sits on when it is not on a branch. */
  headHash: string;
  /**
   * Asks the app to switch branch. Not dispatched here: with uncommitted
   * changes the app asks what should happen to them first (§7).
   */
  onRequestCheckout: (branch: string) => void;
}

export function BranchPanel({
  branches,
  remoteBranches,
  remotes,
  stashes,
  currentBranch,
  defaultBranch,
  onAction,
  branchColours,
  mode,
  headHash,
  onRequestCheckout,
}: BranchPanelProps) {
  const [localOpen, setLocalOpen] = useState(true);
  const [remoteOpen, setRemoteOpen] = useState(true);
  const [stashOpen, setStashOpen] = useState(true);
  const [creatingBranch, setCreatingBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [confirmPopIndex, setConfirmPopIndex] = useState<number | null>(null);

  const localBranches = useMemo(() => sortBranchesForDisplay(branches), [branches]);
  const remoteGroups = useMemo(() => groupRemoteBranches(remoteBranches, remotes), [remoteBranches, remotes]);
  const trimmedBranchName = newBranchName.trim();
  const branchNameExists = useMemo(
    () => localBranches.some((branch) => branch.name === trimmedBranchName),
    [localBranches, trimmedBranchName],
  );

  const resetBranchForm = () => {
    setCreatingBranch(false);
    setNewBranchName('');
  };

  const submitBranch = () => {
    if (!trimmedBranchName || branchNameExists) return;
    onAction({ action: 'create_branch', branch: trimmedBranchName });
    resetBranchForm();
  };

  const handleStashApply = (stashIndex: number) => {
    setConfirmPopIndex((current) => current === stashIndex ? null : current);
    onAction({ action: 'stash_apply', stashIndex });
  };

  const handleStashPop = (stashIndex: number) => {
    if (confirmPopIndex !== stashIndex) {
      setConfirmPopIndex(stashIndex);
      return;
    }

    setConfirmPopIndex(null);
    onAction({ action: 'stash_pop', stashIndex });
  };

  return (
    <div
      className="w-[214px] shrink-0 overflow-auto border-r border-[var(--border-default)] bg-[var(--bg-surface)] git-scrollbar"
      style={{ minHeight: 0 }}
    >
      <div className="min-h-full">
        <Section title="LOCAL" count={localBranches.length} open={localOpen} onToggle={() => setLocalOpen(!localOpen)}>
          {mode === 'detached' && (
            <PositionRow
              label={`HEAD @ ${headHash || 'unknown'}`}
              tone="warning"
              title="You are not on a branch"
            />
          )}
          {/* Before the first commit git lists no branches, but the branch
              exists as a name — saying so beats an empty rail. */}
          {mode === 'unborn' && localBranches.length === 0 && (
            <PositionRow
              label={currentBranch || 'main'}
              note="unborn"
              tone="muted"
              title="This branch starts at your first commit"
            />
          )}
          {localBranches.map((branch) => (
            <BranchBranchRow
              key={branch.name}
              branch={branch}
              currentBranch={currentBranch}
              defaultBranch={defaultBranch}
              onAction={onAction}
              onRequestCheckout={onRequestCheckout}
              laneColour={branchColours?.[branch.name]}
            />
          ))}

          {creatingBranch ? (
            <CreateBranchForm
              value={newBranchName}
              branchNameExists={branchNameExists}
              onChange={setNewBranchName}
              onSubmit={submitBranch}
              onCancel={resetBranchForm}
            />
          ) : (
            <SectionActionButton label="New branch" onClick={() => setCreatingBranch(true)} />
          )}
        </Section>

        <Section title="REMOTE" count={remoteBranches.length} open={remoteOpen} onToggle={() => setRemoteOpen(!remoteOpen)}>
          {remoteGroups.map((group) => (
            <RemoteBranchGroup
              key={group.name}
              name={group.name}
              host={group.host}
              branches={group.branches}
              formatLabel={formatBranchLabel}
            />
          ))}
          {remoteGroups.length === 0 && (
            <div className="px-3 py-2 text-sm text-[var(--text-muted)]">
              {remotes.length === 0 ? 'No remote — publish to add one' : 'No remote branches'}
            </div>
          )}
        </Section>

        <Section title="STASHES" count={stashes.length} open={stashOpen} onToggle={() => setStashOpen(!stashOpen)}>
          {stashes.map((stash) => (
            <StashRow
              key={stash.hash || stash.index}
              stash={stash}
              confirmPop={confirmPopIndex === stash.index}
              onApply={() => handleStashApply(stash.index)}
              onPop={() => handleStashPop(stash.index)}
            />
          ))}
          <SectionActionButton label="Stash changes" onClick={() => onAction({ action: 'stash' })} />
        </Section>
      </div>
    </div>
  );
}

function BranchBranchRow({
  branch,
  currentBranch,
  defaultBranch,
  onAction,
  onRequestCheckout,
  laneColour,
}: {
  branch: BranchInfo;
  currentBranch: string;
  defaultBranch?: string;
  onAction: (action: GitManagerRequest) => void;
  onRequestCheckout: (branch: string) => void;
  /** The colour of this branch's lane in the graph (§3). */
  laneColour?: string;
}) {
  const onCheckout = branch.name === currentBranch
    ? undefined
    : () => onRequestCheckout(branch.name);
  const allowDelete = canDeleteBranch(branch, currentBranch, defaultBranch);
  const onDelete = allowDelete
    ? () => onAction({ action: 'delete_branch', branch: branch.name })
    : undefined;
  const onForceDelete = allowDelete
    ? () => onAction({ action: 'delete_branch', branch: branch.name, force: true })
    : undefined;
  const onRemoveWorktree = branch.checkedOutIn
    ? () => onAction({ action: 'remove_worktree', worktreePath: branch.checkedOutIn })
    : undefined;
  const onForceRemoveWorktree = branch.checkedOutIn
    ? () => onAction({ action: 'remove_worktree', worktreePath: branch.checkedOutIn, force: true })
    : undefined;

  return (
    <BranchContextMenu
      branch={branch}
      onCheckout={onCheckout}
      onDelete={onDelete}
      onForceDelete={onForceDelete}
      onRemoveWorktree={onRemoveWorktree}
      onForceRemoveWorktree={onForceRemoveWorktree}
    >
      <BranchRow
        branch={branch}
        label={branch.name}
        isCurrent={branch.name === currentBranch}
        onCheckout={onCheckout}
        laneColour={laneColour}
      />
    </BranchContextMenu>
  );
}
