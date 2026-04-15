import { useEffect } from 'react';
import {
  clearWorkspaceDiagnosticsRoutes,
  getDiagnosticsModel,
} from './diagnostics-routing';
import { convertDiagnostics } from './lsp-conversions';
import type {
  LspDiagnostic,
  LspNotification,
  LspNotificationEvent,
  LspPosition,
  LspRange,
  PublishDiagnosticsNotification,
  PublishDiagnosticsParams,
} from './lsp-protocol';
import { clearWorkspaceRoutes, type Monaco } from './provider-registry';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLspPosition(value: unknown): value is LspPosition {
  if (!isRecord(value)) return false;
  return typeof value.line === 'number' && typeof value.character === 'number';
}

function isLspRange(value: unknown): value is LspRange {
  if (!isRecord(value)) return false;
  return isLspPosition(value.start) && isLspPosition(value.end);
}

function isLspDiagnostic(value: unknown): value is LspDiagnostic {
  if (!isRecord(value)) return false;
  return typeof value.message === 'string' && isLspRange(value.range);
}

function isPublishDiagnosticsParams(value: unknown): value is PublishDiagnosticsParams {
  if (!isRecord(value)) return false;
  if (typeof value.uri !== 'string' || !Array.isArray(value.diagnostics)) return false;
  return value.diagnostics.every((diagnostic) => isLspDiagnostic(diagnostic));
}

function isPublishDiagnosticsNotification(
  value: LspNotification,
): value is PublishDiagnosticsNotification {
  return value.method === 'textDocument/publishDiagnostics'
    && isPublishDiagnosticsParams(value.params);
}

interface UseLspDiagnosticsOptions {
  monaco: Monaco | null;
  workspaceId: string;
}

export function useLspDiagnostics({ monaco, workspaceId }: UseLspDiagnosticsOptions): void {
  useEffect(() => {
    if (!monaco) return;
    const unsub = window.sero.lsp.onNotification((data: LspNotificationEvent) => {
      if (data.workspaceId !== workspaceId) return;
      const notification = data.notification;
      if (!isPublishDiagnosticsNotification(notification)) return;

      const model = getDiagnosticsModel(workspaceId, notification.params.uri);
      if (!model) return;

      monaco.editor.setModelMarkers(model, 'lsp', convertDiagnostics(notification.params.diagnostics));
    });
    return unsub;
  }, [monaco, workspaceId]);
}

interface UseLspServerStopCleanupOptions {
  workspaceId: string;
  onStopped: () => void;
}

export function useLspServerStopCleanup({
  workspaceId,
  onStopped,
}: UseLspServerStopCleanupOptions): void {
  useEffect(() => {
    const unsub = window.sero.lsp.onServerStopped((data) => {
      if (data.workspaceId !== workspaceId) return;
      clearWorkspaceRoutes(workspaceId);
      clearWorkspaceDiagnosticsRoutes(workspaceId);
      onStopped();
    });
    return unsub;
  }, [workspaceId, onStopped]);
}
