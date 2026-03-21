/**
 * useAppInfo — read-only context about the current app and workspace.
 */

import { useContext } from 'react';
import { AppContext } from './context';

export interface AppInfo {
  appId: string;
  workspaceId: string;
  workspacePath: string;
}

export function useAppInfo(): AppInfo {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppInfo must be used inside an <AppProvider>');
  }

  return {
    appId: ctx.appId,
    workspaceId: ctx.workspaceId,
    workspacePath: ctx.workspacePath,
  };
}
