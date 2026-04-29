export interface GatewayWorkspaceSummary {
  id: string;
  name: string;
}

export interface GatewayRequestErrorInfo {
  requestType: string;
  message: string;
}

export interface GatewayScopeSummary {
  title: string;
  detail: string;
  shortLabel: string;
}

export interface GatewayErrorPresentation {
  title: string;
  detail: string;
}

export function describeGatewayScope(
  workspaces: GatewayWorkspaceSummary[],
  activeWorkspaceId: string | null,
): GatewayScopeSummary | null {
  if (workspaces.length === 0) {
    return null;
  }

  if (workspaces.length === 1) {
    const [workspace] = workspaces;
    return {
      title: `Device access: ${workspace.name}`,
      detail: 'This paired device can only access this workspace.',
      shortLabel: workspace.name,
    };
  }

  const activeWorkspace = activeWorkspaceId
    ? workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null
    : null;

  return {
    title: `Device access: ${workspaces.length} workspaces`,
    detail: activeWorkspace
      ? `Currently browsing ${activeWorkspace.name}.`
      : 'Select a workspace to start browsing files and sessions.',
    shortLabel: `${workspaces.length} workspaces`,
  };
}

export function humanizeGatewayRequestError(
  error: GatewayRequestErrorInfo,
  workspaces: GatewayWorkspaceSummary[],
  activeWorkspaceId: string | null,
): GatewayErrorPresentation {
  const scope = describeGatewayScope(workspaces, activeWorkspaceId);
  const scopeHint = scope
    ? workspaces.length === 1
      ? ` This device is paired only for ${scope.shortLabel}.`
      : ` This device is currently limited to ${scope.shortLabel}.`
    : '';

  if (/workspace not authorized/i.test(error.message)) {
    return {
      title: 'That workspace was not shared with this device',
      detail: `Switch back to a shared workspace or pair this device again from Sero desktop if you need broader access.${scopeHint}`,
    };
  }

  if (/session not authorized/i.test(error.message)) {
    return {
      title: 'That session is outside this device’s access',
      detail: `Open a session from a shared workspace instead, or pair this device again from the workspace that owns the session.${scopeHint}`,
    };
  }

  if (/artifact not authorized/i.test(error.message)) {
    return {
      title: 'That artifact is outside this device’s access',
      detail: `Artifacts can only be opened from sessions shared with this device. Return to the shared session or create a new pairing.${scopeHint}`,
    };
  }

  if (/not authenticated/i.test(error.message)) {
    return {
      title: 'Your device is no longer authenticated',
      detail: 'Reconnect with a valid device token from Sero desktop.',
    };
  }

  return {
    title: 'Sero Remote could not complete that action',
    detail: error.message,
  };
}
