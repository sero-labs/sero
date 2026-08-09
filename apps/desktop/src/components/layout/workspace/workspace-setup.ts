import { useCallback, useRef, useState } from 'react';
import type { ResolvedContribution } from '@/stores/app';
import type { WorkspaceInfo } from '@/types/ipc';
import { executeContributionAction } from '@/lib/contribution-actions';

export interface WorkspaceSetupFailure {
  workspace: WorkspaceInfo;
  message: string;
}

export async function runWorkspaceSetup({
  apps,
  selections,
  workspace,
}: {
  apps: ResolvedContribution<'workspace.create.option'>[];
  selections: Record<string, boolean>;
  workspace: WorkspaceInfo;
}): Promise<string | null> {
  const enabledContributions = apps.filter((resolved) => (
    selections[resolved.key] ?? resolved.contribution.control.defaultValue
  ));
  const results = await Promise.all(enabledContributions.map((resolved) => (
    executeContributionAction(
      resolved.appId,
      workspace.id,
      resolved.contribution.action,
      {
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        workspacePath: workspace.path,
      },
    )
  )));
  const failures = results.flatMap((result, index) => {
    const label = enabledContributions[index].app.label;
    if (!result.ok) return [`${label}: ${result.error.message}`];
    if (result.value.isError) {
      return [`${label}: ${result.value.text || 'Setup failed.'}`];
    }
    return [];
  });
  return failures.length > 0 ? failures.join(' ') : null;
}

export function useWorkspaceSetup(
  apps: ResolvedContribution<'workspace.create.option'>[],
  selections: Record<string, boolean>,
) {
  const [failures, setFailures] = useState<Record<string, WorkspaceSetupFailure>>({});
  const pendingSetupRef = useRef<(() => void) | null>(null);
  const activeFailure = Object.values(failures)[0] ?? null;

  const createSetup = (workspace: WorkspaceInfo): (() => void) => {
    return () => {
      void runWorkspaceSetup({ apps, selections, workspace }).then((message) => {
        if (!message) return;
        console.warn('[workspace] Workspace setup failed:', message);
        setFailures((current) => ({
          ...current,
          [workspace.id]: { workspace, message },
        }));
      });
    };
  };

  const deferSetup = (setup: () => void): void => {
    pendingSetupRef.current = setup;
  };

  const completePendingSetup = useCallback((): void => {
    const setup = pendingSetupRef.current;
    if (!setup) return;
    pendingSetupRef.current = null;
    setup();
  }, []);

  const dismissActiveFailure = (): void => {
    if (!activeFailure) return;
    setFailures((current) => {
      const next = { ...current };
      delete next[activeFailure.workspace.id];
      return next;
    });
  };

  return {
    activeFailure,
    completePendingSetup,
    createSetup,
    deferSetup,
    dismissActiveFailure,
  };
}
