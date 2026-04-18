import type { AppToolResult } from '@sero/common';
import { useCallback, useContext, useMemo } from 'react';

import { AppContext } from './context';
import { getSeroApi } from './sero-bridge';

export interface AppTools {
  run(toolName: string, params?: Record<string, unknown>): Promise<AppToolResult>;
}

export function useAppTools(): AppTools {
  const ctx = useContext(AppContext);

  const run = useCallback<AppTools['run']>(
    async (toolName, params): Promise<AppToolResult> => {
      if (!ctx?.appId || !ctx?.workspaceId) {
        throw new Error('[useAppTools] No app context — must be used inside a Sero app');
      }

      const { appAgent } = getSeroApi();
      if (!appAgent.invokeTool) {
        throw new Error('[useAppTools] App tool bridge unavailable');
      }

      return appAgent.invokeTool(ctx.appId, ctx.workspaceId, toolName, params ?? {});
    },
    [ctx],
  );

  return useMemo(() => ({ run }), [run]);
}
