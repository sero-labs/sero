import type {
  ToolContributionAction,
  WorkspaceCreatedContributionContext,
} from '@sero-ai/common';

export type ContributionActionResult =
  | { ok: true; value: Awaited<ReturnType<typeof window.sero.appAgent.invokeTool>> }
  | { ok: false; error: Error };

/** Invoke an allowlisted app-local tool action with host-owned context precedence. */
export async function executeContributionAction(
  appId: string,
  workspaceId: string,
  action: ToolContributionAction,
  hostContext: WorkspaceCreatedContributionContext,
): Promise<ContributionActionResult> {
  try {
    const value = await window.sero.appAgent.invokeTool(appId, workspaceId, action.tool, {
      ...action.params,
      ...hostContext,
    });
    return { ok: true, value };
  } catch (cause) {
    return {
      ok: false,
      error: cause instanceof Error ? cause : new Error(String(cause)),
    };
  }
}
