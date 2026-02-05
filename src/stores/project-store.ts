import { create } from 'zustand';

export type ProjectStatus = 'creating' | 'running' | 'stopping' | 'stopped' | 'error';

export interface Project {
  id: string;
  name: string;
  image: string;
  status: ProjectStatus;
  cpus: number;
  memoryMB: number;
  ports: Array<{ host: number; container: number }>;
  ipAddress?: string;
  createdAt: number;
}

interface ProjectStore {
  projects: Map<string, Project>;
  activeProjectId: string | null;

  // Actions
  setActiveProject: (id: string | null) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  removeProject: (id: string) => void;
  reorderProjects: (orderedIds: string[]) => void;

  // Derived
  getActiveProject: () => Project | null;
  getProjectList: () => Project[];
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: new Map(),
  activeProjectId: null,

  setActiveProject: (id) => set({ activeProjectId: id }),

  addProject: (project) =>
    set((state) => {
      const next = new Map(state.projects);
      next.set(project.id, project);
      return { projects: next, activeProjectId: project.id };
    }),

  updateProject: (id, updates) =>
    set((state) => {
      const next = new Map(state.projects);
      const existing = next.get(id);
      if (existing) {
        next.set(id, { ...existing, ...updates });
      }
      return { projects: next };
    }),

  removeProject: (id) =>
    set((state) => {
      const next = new Map(state.projects);
      next.delete(id);
      const activeProjectId =
        state.activeProjectId === id
          ? (next.keys().next().value ?? null)
          : state.activeProjectId;
      return { projects: next, activeProjectId };
    }),

  reorderProjects: (orderedIds) =>
    set((state) => {
      const next = new Map<string, Project>();
      for (const id of orderedIds) {
        const p = state.projects.get(id);
        if (p) next.set(id, p);
      }
      // Add any projects not in the ordered list (shouldn't happen, safety net)
      for (const [id, p] of state.projects) {
        if (!next.has(id)) next.set(id, p);
      }
      return { projects: next };
    }),

  getActiveProject: () => {
    const { projects, activeProjectId } = get();
    return activeProjectId ? projects.get(activeProjectId) ?? null : null;
  },

  getProjectList: () => {
    return Array.from(get().projects.values());
  },
}));
