import type { editor } from 'monaco-editor';

type DiagnosticsModel = editor.ITextModel;

const diagnosticsRoutesByWorkspace = new Map<string, Map<string, DiagnosticsModel>>();

function getWorkspaceRoutes(workspaceId: string, create: boolean): Map<string, DiagnosticsModel> | undefined {
  const existing = diagnosticsRoutesByWorkspace.get(workspaceId);
  if (existing || !create) {
    return existing;
  }
  const created = new Map<string, DiagnosticsModel>();
  diagnosticsRoutesByWorkspace.set(workspaceId, created);
  return created;
}

export function setDiagnosticsRoute(workspaceId: string, fileUri: string, model: DiagnosticsModel): void {
  const workspaceRoutes = getWorkspaceRoutes(workspaceId, true);
  if (!workspaceRoutes) return;
  workspaceRoutes.set(fileUri, model);
}

export function getDiagnosticsModel(workspaceId: string, fileUri: string): DiagnosticsModel | undefined {
  const workspaceRoutes = getWorkspaceRoutes(workspaceId, false);
  return workspaceRoutes?.get(fileUri);
}

export function deleteDiagnosticsRoute(workspaceId: string, fileUri: string): void {
  const workspaceRoutes = getWorkspaceRoutes(workspaceId, false);
  if (!workspaceRoutes) return;

  workspaceRoutes.delete(fileUri);
  if (workspaceRoutes.size === 0) {
    diagnosticsRoutesByWorkspace.delete(workspaceId);
  }
}

export function clearWorkspaceDiagnosticsRoutes(workspaceId: string): void {
  diagnosticsRoutesByWorkspace.delete(workspaceId);
}
