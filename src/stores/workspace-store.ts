import { create } from 'zustand';
import type { DockviewApi } from 'dockview-core';

export type PanelType = 'editor' | 'terminal' | 'agent' | 'preview';

export interface PanelDef {
  id: string;
  type: PanelType;
  title: string;
  params?: Record<string, unknown>;
}

interface WorkspaceState {
  /** dockview API instance per project */
  apis: Map<string, DockviewApi>;
  /** Track which panels exist per project (for re-creation on HMR etc.) */
  panelDefs: Map<string, PanelDef[]>;
}

interface WorkspaceActions {
  setApi: (projectId: string, api: DockviewApi) => void;
  getApi: (projectId: string) => DockviewApi | undefined;
  initWorkspace: (projectId: string) => void;
  setPanelDefs: (projectId: string, defs: PanelDef[]) => void;
  getPanelDefs: (projectId: string) => PanelDef[];
  cleanupWorkspace: (projectId: string) => void;
  addTerminal: (projectId: string) => void;
}

type WorkspaceStore = WorkspaceState & WorkspaceActions;

let panelCounter = 0;
export function generatePanelId(type: PanelType): string {
  return `${type}-${++panelCounter}`;
}

export function defaultPanelDefs(): PanelDef[] {
  return [
    { id: generatePanelId('editor'), type: 'editor', title: 'Editor' },
    { id: generatePanelId('terminal'), type: 'terminal', title: 'Terminal', params: { terminalId: `term-${Date.now()}` } },
    { id: generatePanelId('preview'), type: 'preview', title: 'Preview' },
    { id: generatePanelId('agent'), type: 'agent', title: 'Agent' },
  ];
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  apis: new Map(),
  panelDefs: new Map(),

  setApi: (projectId, api) =>
    set((state) => {
      const next = new Map(state.apis);
      next.set(projectId, api);
      return { apis: next };
    }),

  getApi: (projectId) => get().apis.get(projectId),

  initWorkspace: (projectId) =>
    set((state) => {
      const next = new Map(state.panelDefs);
      if (!next.has(projectId)) {
        next.set(projectId, defaultPanelDefs());
      }
      return { panelDefs: next };
    }),

  setPanelDefs: (projectId, defs) =>
    set((state) => {
      const next = new Map(state.panelDefs);
      next.set(projectId, defs);
      return { panelDefs: next };
    }),

  getPanelDefs: (projectId) => get().panelDefs.get(projectId) ?? defaultPanelDefs(),

  addTerminal: (projectId) => {
    const api = get().apis.get(projectId);
    if (!api) return;
    const panelId = generatePanelId('terminal');
    const terminalId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    // Find existing terminal panel to stack as a tab next to it
    const existingTerminal = api.panels.find((p) => p.api.component === 'terminal');

    api.addPanel({
      id: panelId,
      title: 'Terminal',
      component: 'terminal',
      params: { projectId, panelId, panelType: 'terminal', terminalId },
      position: existingTerminal
        ? { referencePanel: existingTerminal.api.id, direction: 'within' }
        : undefined,
    });
  },

  cleanupWorkspace: (projectId) =>
    set((state) => {
      const apis = new Map(state.apis);
      const panelDefs = new Map(state.panelDefs);
      // Don't call api.dispose() — React will unmount DockviewReact
      // which handles disposal. Double-dispose crashes dockview.
      apis.delete(projectId);
      panelDefs.delete(projectId);
      return { apis, panelDefs };
    }),
}));
