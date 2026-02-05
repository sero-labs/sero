import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DockviewReact,
  type IDockviewPanelProps,
  type DockviewReadyEvent,
  type IDockviewPanelHeaderProps,
  type DockviewApi,
} from 'dockview-react';
import 'dockview-core/dist/styles/dockview.css';
import { useWorkspaceStore, type PanelDef } from '../stores/workspace-store';
import { EditorPanel } from './panels/EditorPanel';
import { TerminalPanel } from './panels/TerminalPanel';
import { AgentPanel } from './panels/AgentPanel';
import { PreviewPanel } from './panels/PreviewPanel';
import './TiledWorkspace.css';

interface Props {
  projectId: string;
}

/* ── Panel content components registered with dockview ────── */

const PANEL_ICONS: Record<string, string> = {
  editor: '📝',
  terminal: '⬛',
  agent: '🤖',
  preview: '🌐',
};

function EditorPanelComponent({ params }: IDockviewPanelProps<{ projectId: string; panelId: string }>) {
  return <EditorPanel projectId={params.projectId} panelId={params.panelId} />;
}

function TerminalPanelComponent({ params }: IDockviewPanelProps<{ projectId: string; panelId: string; terminalId: string }>) {
  return <TerminalPanel projectId={params.projectId} panelId={params.panelId} terminalId={params.terminalId} />;
}

function AgentPanelComponent({ params }: IDockviewPanelProps<{ projectId: string; panelId: string }>) {
  return <AgentPanel projectId={params.projectId} panelId={params.panelId} />;
}

function PreviewPanelComponent({ params }: IDockviewPanelProps<{ projectId: string; panelId: string }>) {
  return <PreviewPanel projectId={params.projectId} panelId={params.panelId} />;
}

/* ── Custom tab component ─────────────────────────────────── */

function SeroTab({ api, params }: IDockviewPanelHeaderProps<{ panelType?: string; projectId?: string }>) {
  const icon = PANEL_ICONS[params.panelType ?? ''] ?? '📄';
  const title = api.title ?? 'Panel';
  const { addTerminal } = useWorkspaceStore();
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  // Close menu on any click or escape
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', handleKey);
    };
  }, [ctxMenu]);

  return (
    <>
      <div className="sero-dockview-tab" onContextMenu={handleContextMenu}>
        <span className="sero-dockview-tab-icon">{icon}</span>
        <span className="sero-dockview-tab-title">{title}</span>
        {params.panelType === 'terminal' && params.projectId && (
          <button
            className="sero-dockview-tab-add"
            title="New terminal"
            onClick={(e) => {
              e.stopPropagation();
              addTerminal(params.projectId!);
            }}
          >
            +
          </button>
        )}
      </div>
      {ctxMenu && (
        <div
          className="sero-tab-context-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {params.panelType === 'terminal' && params.projectId && (
            <button
              className="sero-tab-context-item"
              onClick={() => { addTerminal(params.projectId!); setCtxMenu(null); }}
            >
              New Terminal
            </button>
          )}
          <button
            className="sero-tab-context-item sero-tab-context-danger"
            onClick={() => { api.close(); setCtxMenu(null); }}
          >
            Close Panel
          </button>
        </div>
      )}
    </>
  );
}

/* ── Main workspace ───────────────────────────────────────── */

export function TiledWorkspace({ projectId }: Props) {
  const { setApi, getPanelDefs } = useWorkspaceStore();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const components = useMemo(
    () => ({
      editor: EditorPanelComponent,
      terminal: TerminalPanelComponent,
      agent: AgentPanelComponent,
      preview: PreviewPanelComponent,
    }),
    []
  );

  // Debounced layout save
  const saveLayout = useCallback(
    (api: DockviewApi) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        try {
          const layoutData = api.toJSON();
          window.sero.persistence.saveLayout(projectId, layoutData);
        } catch (err) {
          console.error('Failed to save layout:', err);
        }
      }, 500);
    },
    [projectId]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleReady = useCallback(
    async (event: DockviewReadyEvent) => {
      const api = event.api;
      setApi(projectId, api);

      // Try to restore saved layout
      let restored = false;
      try {
        const savedLayout = await window.sero.persistence.loadLayout(projectId);
        if (savedLayout) {
          api.fromJSON(savedLayout);
          restored = true;
        }
      } catch (err) {
        console.warn('Failed to restore layout, building default:', err);
      }

      // Fall back to default layout
      if (!restored) {
        const defs = getPanelDefs(projectId);
        buildDefaultLayout(api, defs, projectId);
      }

      // Listen for layout changes and save
      api.onDidLayoutChange(() => saveLayout(api));
    },
    [projectId, setApi, getPanelDefs, saveLayout]
  );

  return (
    <div className="tiled-workspace">
      <DockviewReact
        components={components}
        defaultTabComponent={SeroTab}
        onReady={handleReady}
        className="sero-dockview"
      />
    </div>
  );
}

/* ── Build the default 4-panel layout ─────────────────────── */

function buildDefaultLayout(api: DockviewApi, defs: PanelDef[], projectId: string) {
  const editorDef = defs.find((d) => d.type === 'editor');
  const terminalDef = defs.find((d) => d.type === 'terminal');
  const previewDef = defs.find((d) => d.type === 'preview');
  const agentDef = defs.find((d) => d.type === 'agent');

  if (editorDef) {
    api.addPanel({
      id: editorDef.id,
      title: editorDef.title,
      component: editorDef.type,
      params: { projectId, panelId: editorDef.id, panelType: editorDef.type },
    });
  }

  if (terminalDef) {
    api.addPanel({
      id: terminalDef.id,
      title: terminalDef.title,
      component: terminalDef.type,
      params: {
        projectId,
        panelId: terminalDef.id,
        panelType: terminalDef.type,
        terminalId: (terminalDef.params?.terminalId as string) ?? terminalDef.id,
      },
      position: editorDef
        ? { referencePanel: editorDef.id, direction: 'below' }
        : undefined,
    });
  }

  if (previewDef) {
    api.addPanel({
      id: previewDef.id,
      title: previewDef.title,
      component: previewDef.type,
      params: { projectId, panelId: previewDef.id, panelType: previewDef.type },
      position: editorDef
        ? { referencePanel: editorDef.id, direction: 'right' }
        : undefined,
    });
  }

  if (agentDef) {
    api.addPanel({
      id: agentDef.id,
      title: agentDef.title,
      component: agentDef.type,
      params: { projectId, panelId: agentDef.id, panelType: agentDef.type },
      position: previewDef
        ? { referencePanel: previewDef.id, direction: 'below' }
        : undefined,
    });
  }
}
