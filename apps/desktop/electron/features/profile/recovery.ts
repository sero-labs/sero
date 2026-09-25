import { dialog, shell } from 'electron';

import {
  backupAndResetRegistrySync,
  salvageRegistrySync,
  type ProfileRegistryResetResult,
  type ProfileRegistrySalvageResult,
} from './registry-recovery';
import { selectSalvageCandidates, type SalvageCandidate } from './discovery';

export interface ProfileRegistryStartupIssue {
  kind: 'malformed_profile_registry';
  registryPath: string;
  message: string;
}

interface RecoveryButtons {
  buttons: string[];
  salvageIndex: number | null;
  resetIndex: number;
  openIndex: number;
  quitIndex: number;
}

function buildButtons(candidates: SalvageCandidate[]): RecoveryButtons {
  const keepLabel = `Keep ${candidates.length} existing profile${candidates.length === 1 ? '' : 's'}`;
  const buttons = candidates.length > 0
    ? [keepLabel, 'Reset and Restart', 'Open Folder', 'Quit']
    : ['Reset and Restart', 'Open Folder', 'Quit'];

  const salvageIndex = candidates.length > 0 ? 0 : null;
  const resetIndex = salvageIndex === null ? 0 : 1;

  return {
    buttons,
    salvageIndex,
    resetIndex,
    openIndex: resetIndex + 1,
    quitIndex: resetIndex + 2,
  };
}

function describeIssue(issue: ProfileRegistryStartupIssue, candidates: SalvageCandidate[]): string {
  const lines = [
    issue.message,
    '',
    `Registry: ${issue.registryPath}`,
  ];

  if (candidates.length > 0) {
    lines.push(
      '',
      `Sero found ${candidates.length} profile${candidates.length === 1 ? '' : 's'} on disk that the broken registry still names.`,
      'Keep them to rebuild the registry with those profiles. Reset is still available.',
    );
  } else {
    lines.push(
      '',
      'Reset will back up the broken file and replace it with an empty profiles.json so Sero can start again.',
    );
  }

  lines.push('Choose Open Folder if you want to inspect or repair the file manually first.');
  return lines.join('\n');
}

export async function handleProfileRegistryRecovery(
  issue: ProfileRegistryStartupIssue,
): Promise<'relaunch' | 'quit'> {
  const recover = async (): Promise<'relaunch' | 'quit'> => {
    const candidates = selectSalvageCandidates(issue.registryPath);
    const { buttons, salvageIndex, resetIndex, openIndex, quitIndex } = buildButtons(candidates);

    const choice = await dialog.showMessageBox({
      type: 'warning',
      buttons,
      defaultId: 0,
      cancelId: quitIndex,
      noLink: true,
      title: 'Recover profile registry',
      message: 'Sero could not read your profile registry.',
      detail: describeIssue(issue, candidates),
    });

    const reportResult = async (
      result: ProfileRegistryResetResult | ProfileRegistrySalvageResult,
      message: string,
    ): Promise<'relaunch'> => {
      const kept = 'kept' in result ? ` Sero kept ${result.kept} profile(s).` : '';
      await dialog.showMessageBox({
        type: 'info',
        buttons: ['Restart Sero'],
        defaultId: 0,
        cancelId: 0,
        noLink: true,
        title: 'Profile registry repaired',
        message,
        detail: result.backupPath
          ? `Backup saved to ${result.backupPath}${kept}`
          : `A fresh registry was written to ${result.registryPath}${kept}`,
      });
      return 'relaunch';
    };

    const retryAfterFailure = async (title: string, message: string, error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      const retry = await dialog.showMessageBox({
        type: 'error',
        buttons: ['Try Again', 'Quit'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        title,
        message,
        detail,
      });
      return retry.response === 1 ? 'quit' as const : null;
    };

    if (salvageIndex !== null && choice.response === salvageIndex) {
      try {
        const result = salvageRegistrySync(candidates);
        return await reportResult(result, 'Sero kept the profiles that still exist on disk.');
      } catch (error) {
        const quit = await retryAfterFailure(
          'Profile recovery failed',
          'Sero could not rebuild the profile registry from the existing folders.',
          error,
        );
        return quit ?? recover();
      }
    }

    if (choice.response === resetIndex) {
      try {
        const result = backupAndResetRegistrySync();
        return await reportResult(result, 'Sero repaired the profile registry and is ready to restart.');
      } catch (error) {
        const quit = await retryAfterFailure(
          'Profile recovery failed',
          'Sero could not reset the broken profile registry.',
          error,
        );
        return quit ?? recover();
      }
    }

    if (choice.response === openIndex) {
      await shell.showItemInFolder(issue.registryPath);
      return recover();
    }

    return 'quit';
  };

  return recover();
}
