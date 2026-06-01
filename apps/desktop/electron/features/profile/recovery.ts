import { dialog, shell } from 'electron';

import { backupAndResetRegistrySync } from './manager';

export interface ProfileRegistryStartupIssue {
  kind: 'malformed_profile_registry';
  registryPath: string;
  message: string;
}

export async function handleProfileRegistryRecovery(
  issue: ProfileRegistryStartupIssue,
): Promise<'relaunch' | 'quit'> {
  const recover = async (): Promise<'relaunch' | 'quit'> => {
    const choice = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Reset and Restart', 'Open Folder', 'Quit'],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      title: 'Recover profile registry',
      message: 'Sero could not read your profile registry.',
      detail: [
        issue.message,
        '',
        `Registry: ${issue.registryPath}`,
        '',
        'Reset will back up the broken file and replace it with an empty profiles.json so Sero can start again.',
        'Choose Open Folder if you want to inspect or repair the file manually first.',
      ].join('\n'),
    });

    if (choice.response === 0) {
      try {
        const result = backupAndResetRegistrySync();
        await dialog.showMessageBox({
          type: 'info',
          buttons: ['Restart Sero'],
          defaultId: 0,
          cancelId: 0,
          noLink: true,
          title: 'Profile registry reset',
          message: 'Sero repaired the profile registry and is ready to restart.',
          detail: result.backupPath
            ? `Backup saved to ${result.backupPath}`
            : `A fresh registry was written to ${result.registryPath}`,
        });
        return 'relaunch';
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const retry = await dialog.showMessageBox({
          type: 'error',
          buttons: ['Try Again', 'Quit'],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
          title: 'Profile recovery failed',
          message: 'Sero could not reset the broken profile registry.',
          detail: message,
        });
        if (retry.response === 1) {
          return 'quit';
        }
        return recover();
      }
    }

    if (choice.response === 1) {
      await shell.showItemInFolder(issue.registryPath);
      return recover();
    }

    return 'quit';
  };

  return recover();
}
