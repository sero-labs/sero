/**
 * CanvasApp — main Sero app component for the collaborative Canvas editor.
 *
 * Layout: document list sidebar (left) + editor area (center) +
 * optional version history panel (right).
 *
 * Features:
 * - Create/edit/delete versioned documents
 * - Direct inline editing (text and code)
 * - AI-assisted writing via useAI
 * - Version snapshots and restore
 * - Workspace-scoped state via useAppState
 */

import { useState, useCallback, useMemo } from 'react';
import { useAppState, useAI, useAgentPrompt } from '@sero/app-runtime';
import type {
  CanvasState,
  CanvasDocument,
  DocumentType,
  CodeLanguage,
  DocumentVersion,
} from '../shared/types';
import { DEFAULT_STATE } from '../shared/types';
import { DocumentList } from './components/DocumentList';
import { EditorToolbar } from './components/EditorToolbar';
import { EditorArea } from './components/EditorArea';
import { VersionPanel } from './components/VersionPanel';
import { StatusBar } from './components/StatusBar';
import { EmptyState } from './components/EmptyState';
import './styles.css';

export function CanvasApp() {
  const [state, updateState] = useAppState<CanvasState>(DEFAULT_STATE);
  const ai = useAI();
  const prompt = useAgentPrompt();

  const [showVersions, setShowVersions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);

  // ── Derived data ─────────────────────────────────────────

  const activeDoc = useMemo(
    () => state.documents.find((d) => d.id === state.activeDocumentId) ?? null,
    [state.documents, state.activeDocumentId],
  );

  // ── Document management ──────────────────────────────────

  const handleSelectDoc = useCallback(
    (id: number) => {
      updateState((prev) => ({ ...prev, activeDocumentId: id }));
    },
    [updateState],
  );

  const handleCreateDoc = useCallback(
    (title: string, type: DocumentType) => {
      const now = new Date().toISOString();
      updateState((prev) => {
        const doc: CanvasDocument = {
          id: prev.nextId,
          title,
          content: '',
          type,
          language: type === 'code' ? 'plaintext' : 'markdown',
          versions: [],
          nextVersionId: 1,
          createdAt: now,
          updatedAt: now,
        };
        return {
          ...prev,
          documents: [...prev.documents, doc],
          activeDocumentId: doc.id,
          nextId: prev.nextId + 1,
        };
      });
      setShowNewForm(false);
    },
    [updateState],
  );

  const handleDeleteDoc = useCallback(
    (id: number) => {
      updateState((prev) => {
        const filtered = prev.documents.filter((d) => d.id !== id);
        return {
          ...prev,
          documents: filtered,
          activeDocumentId:
            prev.activeDocumentId === id
              ? (filtered[0]?.id ?? null)
              : prev.activeDocumentId,
        };
      });
    },
    [updateState],
  );

  // ── Content editing ──────────────────────────────────────

  const handleContentChange = useCallback(
    (content: string) => {
      updateState((prev) => ({
        ...prev,
        documents: prev.documents.map((d) =>
          d.id === prev.activeDocumentId
            ? { ...d, content, updatedAt: new Date().toISOString() }
            : d,
        ),
      }));
    },
    [updateState],
  );

  const handleTitleChange = useCallback(
    (title: string) => {
      updateState((prev) => ({
        ...prev,
        documents: prev.documents.map((d) =>
          d.id === prev.activeDocumentId
            ? { ...d, title, updatedAt: new Date().toISOString() }
            : d,
        ),
      }));
    },
    [updateState],
  );

  const handleLanguageChange = useCallback(
    (language: CodeLanguage) => {
      updateState((prev) => ({
        ...prev,
        documents: prev.documents.map((d) =>
          d.id === prev.activeDocumentId
            ? { ...d, language, updatedAt: new Date().toISOString() }
            : d,
        ),
      }));
    },
    [updateState],
  );

  // ── Version management ───────────────────────────────────

  const handleSnapshot = useCallback(() => {
    if (!activeDoc) return;
    updateState((prev) => ({
      ...prev,
      documents: prev.documents.map((d) => {
        if (d.id !== prev.activeDocumentId) return d;
        const version: DocumentVersion = {
          id: d.nextVersionId,
          content: d.content,
          createdAt: new Date().toISOString(),
        };
        return {
          ...d,
          versions: [...d.versions, version],
          nextVersionId: d.nextVersionId + 1,
        };
      }),
    }));
  }, [activeDoc, updateState]);

  const handleRestore = useCallback(
    (version: DocumentVersion) => {
      updateState((prev) => ({
        ...prev,
        documents: prev.documents.map((d) =>
          d.id === prev.activeDocumentId
            ? { ...d, content: version.content, updatedAt: new Date().toISOString() }
            : d,
        ),
      }));
    },
    [updateState],
  );

  // ── AI integration ───────────────────────────────────────

  const handlePromptAgent = useCallback(() => {
    prompt('Create a new canvas document. Ask me what I want to write or code.');
  }, [prompt]);

  const handleCreateNewFromEmpty = useCallback(() => {
    setShowNewForm(true);
    handleCreateDoc('Untitled', 'text');
  }, [handleCreateDoc]);

  // ── Render ───────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex min-h-0 flex-1">
        {/* Document sidebar */}
        <div className="w-48 flex-shrink-0">
          <DocumentList
            documents={state.documents}
            activeDocumentId={state.activeDocumentId}
            onSelect={handleSelectDoc}
            onCreate={handleCreateDoc}
            onDelete={handleDeleteDoc}
          />
        </div>

        {/* Main editor area */}
        {activeDoc ? (
          <div className="flex min-w-0 flex-1 flex-col">
            <EditorToolbar
              document={activeDoc}
              showVersions={showVersions}
              loading={loading}
              onToggleVersions={() => setShowVersions(!showVersions)}
              onSnapshot={handleSnapshot}
              onLanguageChange={handleLanguageChange}
              onTitleChange={handleTitleChange}
            />

            <div className="flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">
                <EditorArea
                  content={activeDoc.content}
                  type={activeDoc.type}
                  onChange={handleContentChange}
                />
                <StatusBar
                  content={activeDoc.content}
                  type={activeDoc.type}
                  language={activeDoc.language}
                />
              </div>

              {/* Version history panel */}
              {showVersions && (
                <VersionPanel
                  versions={activeDoc.versions}
                  currentContent={activeDoc.content}
                  onRestore={handleRestore}
                />
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1">
            <EmptyState
              hasDocuments={state.documents.length > 0}
              onCreateNew={handleCreateNewFromEmpty}
              onPromptAgent={handlePromptAgent}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default CanvasApp;
