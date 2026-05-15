/**
 * React hook for LSP integration with Monaco editor.
 * Manages server lifecycle, Monaco provider registration, and document sync.
 *
 * Active on every runtime that advertises `languageServers` capability: host,
 * Docker, and Apple Container. Docker startup is handled by the runtime backend;
 * Apple Container still waits on the legacy renderer container status.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useContainerStore } from '@/stores/container';
import { useWorkspaceStore } from '@/stores/workspace';
import { useLspDiagnostics, useLspServerStopCleanup } from './diagnostics';
import { useLspDocumentSync, type LspEditor } from './document-sync';
import { LSP_PROVIDER_LANGUAGE_IDS, getLspServerLanguage } from './language-routing';
import { ensureProvidersRegistered, type Monaco } from './provider-registry';

export interface UseLspOptions {
  workspaceId: string;
  filePath: string | null;
  languageId: string;
  monaco: Monaco | null;
  editor: LspEditor | null;
}

export interface UseLspResult {
  isReady: boolean;
  serverLanguage: string | null;
  statusNotice: string | null;
  sendDidSave: () => void;
}

export function useLsp({ workspaceId, filePath, languageId, monaco, editor }: UseLspOptions): UseLspResult {
  const [isReady, setIsReady] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const serverLanguageRef = useRef<string | null>(null);
  const startingRef = useRef(false);

  const containerStatus = useContainerStore((state) => state.containers[workspaceId]?.status ?? 'none');
  const runtimeBackend = useWorkspaceStore((state) =>
    state.workspaces.find((workspace) => workspace.id === workspaceId)?.runtime?.backend ?? null,
  );
  const requiresContainer = runtimeBackend === 'apple-container';
  const runtimeReady = !requiresContainer || containerStatus === 'running';
  const serverLanguage = getLspServerLanguage(languageId);

  useLspDiagnostics({ monaco, workspaceId });

  const handleServerStopped = useCallback(() => {
    serverLanguageRef.current = null;
    setIsReady(false);
  }, []);

  const statusNotice = serverLanguage
    ? startupError ?? (requiresContainer && !runtimeReady
      ? 'Language servers will start once the workspace container is running.'
      : null)
    : null;

  useLspServerStopCleanup({ workspaceId, onStopped: handleServerStopped });

  const { sendDidSave } = useLspDocumentSync({
    workspaceId,
    filePath,
    languageId,
    monaco,
    editor,
    isReady,
    serverLanguage,
  });

  useEffect(() => {
    if (!monaco || !serverLanguage || startingRef.current) return;
    if (!runtimeReady) return;
    if (serverLanguageRef.current === serverLanguage) return;

    let cancelled = false;
    startingRef.current = true;

    (async () => {
      try {
        const { language } = await window.sero.lsp.start(workspaceId, languageId);
        if (cancelled) return;
        serverLanguageRef.current = language;
        setStartupError(null);
        setIsReady(true);
        for (const languageIdEntry of LSP_PROVIDER_LANGUAGE_IDS) {
          ensureProvidersRegistered(monaco, languageIdEntry);
        }
      } catch (err) {
        console.warn('[lsp] Failed to start server:', err);
        if (!cancelled) {
          setStartupError(err instanceof Error ? err.message : 'Failed to start the language server');
          setIsReady(false);
        }
      } finally {
        startingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, languageId, monaco, serverLanguage, runtimeReady]);

  return {
    isReady,
    serverLanguage: serverLanguageRef.current,
    statusNotice,
    sendDidSave,
  };
}
