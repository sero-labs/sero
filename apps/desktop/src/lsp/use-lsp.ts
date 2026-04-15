/**
 * React hook for LSP integration with Monaco editor.
 * Manages server lifecycle, Monaco provider registration, and document sync.
 *
 * Only active for containerized workspaces (LSP servers run inside containers).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useContainerStore } from '@/stores/container';
import { useLspDiagnostics, useLspServerStopCleanup } from './diagnostics';
import { useLspDocumentSync, type LspEditor } from './document-sync';
import { LSP_LANGUAGES, getLspServerLanguage } from './lsp-conversions';
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
  sendDidSave: () => void;
}

export function useLsp({ workspaceId, filePath, languageId, monaco, editor }: UseLspOptions): UseLspResult {
  const [isReady, setIsReady] = useState(false);
  const serverLanguageRef = useRef<string | null>(null);
  const startingRef = useRef(false);

  const containerStatus = useContainerStore((state) => state.containers[workspaceId]?.status ?? 'none');
  const serverLanguage = getLspServerLanguage(languageId);

  useLspDiagnostics({ monaco, workspaceId });

  const handleServerStopped = useCallback(() => {
    serverLanguageRef.current = null;
    setIsReady(false);
  }, []);

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
    if (containerStatus !== 'running') return;
    if (serverLanguageRef.current === serverLanguage) return;

    let cancelled = false;
    startingRef.current = true;

    (async () => {
      try {
        const { language } = await window.sero.lsp.start(workspaceId, languageId);
        if (cancelled) return;
        serverLanguageRef.current = language;
        setIsReady(true);
        for (const languageIdEntry of LSP_LANGUAGES) {
          ensureProvidersRegistered(monaco, languageIdEntry);
        }
      } catch (err) {
        console.warn('[lsp] Failed to start server:', err);
        if (!cancelled) setIsReady(false);
      } finally {
        startingRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, languageId, monaco, serverLanguage, containerStatus]);

  return { isReady, serverLanguage: serverLanguageRef.current, sendDidSave };
}
