import { useEffect } from 'react';
import { convertDiagnostics } from './lsp-conversions';
import { clearWorkspaceRoutes, type Monaco } from './provider-registry';

interface PublishDiagnosticsParams {
  uri: string;
  diagnostics: unknown[];
}

interface UseLspDiagnosticsOptions {
  monaco: Monaco | null;
  workspaceId: string;
}

export function useLspDiagnostics({ monaco, workspaceId }: UseLspDiagnosticsOptions): void {
  useEffect(() => {
    if (!monaco) return;
    const unsub = window.sero.lsp.onNotification((data) => {
      if (data.workspaceId !== workspaceId) return;
      const notification = data.notification;
      if (notification.method === 'textDocument/publishDiagnostics') {
        const params = notification.params as PublishDiagnosticsParams;
        const uri = params.uri;
        const containerPath = uri.replace('file://', '');
        const models = monaco.editor.getModels();
        const model = models.find((entry) => entry.uri.path === containerPath);
        if (model) {
          monaco.editor.setModelMarkers(model, 'lsp', convertDiagnostics(params.diagnostics as never[]));
        }
      }
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
      onStopped();
    });
    return unsub;
  }, [workspaceId, onStopped]);
}
