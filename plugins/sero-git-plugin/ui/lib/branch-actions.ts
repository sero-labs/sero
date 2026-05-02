import type { BranchInfo } from '../../shared/types';

export function isDefaultBranch(branch: BranchInfo, defaultBranch?: string): boolean {
  return Boolean(defaultBranch) && branch.name === defaultBranch;
}

export function canDeleteBranch(
  branch: BranchInfo,
  currentBranch: string,
  defaultBranch?: string,
): boolean {
  if (branch.name === currentBranch) return false;
  if (branch.current) return false;
  if (isDefaultBranch(branch, defaultBranch)) return false;
  if (branch.checkedOutIn) return false;
  return true;
}
