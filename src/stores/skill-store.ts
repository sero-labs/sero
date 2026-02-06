import { create } from 'zustand';

export interface SkillInfo {
  name: string;
  description: string;
  filePath: string;
  baseDir: string;
  source: string;
  scope: 'global' | 'project' | 'custom';
  enabled: boolean;
  disableModelInvocation: boolean;
}

export type SkillsView = 'browse' | 'detail' | 'install' | 'create';

interface SkillStore {
  /** All discovered skills (with per-project enabled state applied) */
  skills: SkillInfo[];
  /** Currently selected skill (for detail view) */
  selectedSkill: string | null;
  /** Current view in the skills panel */
  view: SkillsView;
  /** Loading state */
  isLoading: boolean;
  /** Search query */
  searchQuery: string;
  /** Skill content cache: name → SKILL.md content */
  contentCache: Map<string, string>;
  /** Skill files cache: name → file list */
  filesCache: Map<string, string[]>;

  // Actions
  setSkills: (skills: SkillInfo[]) => void;
  setSelectedSkill: (name: string | null) => void;
  setView: (view: SkillsView) => void;
  setLoading: (loading: boolean) => void;
  setSearchQuery: (query: string) => void;
  cacheContent: (name: string, content: string) => void;
  cacheFiles: (name: string, files: string[]) => void;
  updateSkillEnabled: (name: string, enabled: boolean) => void;
  removeSkill: (name: string) => void;

  // Derived
  getFilteredSkills: () => SkillInfo[];
}

export const useSkillStore = create<SkillStore>((set, get) => ({
  skills: [],
  selectedSkill: null,
  view: 'browse',
  isLoading: false,
  searchQuery: '',
  contentCache: new Map(),
  filesCache: new Map(),

  setSkills: (skills) => set({ skills }),

  setSelectedSkill: (name) => set({ selectedSkill: name, view: name ? 'detail' : 'browse' }),

  setView: (view) => set({ view }),

  setLoading: (isLoading) => set({ isLoading }),

  setSearchQuery: (searchQuery) => set({ searchQuery }),

  cacheContent: (name, content) =>
    set((state) => {
      const next = new Map(state.contentCache);
      next.set(name, content);
      return { contentCache: next };
    }),

  cacheFiles: (name, files) =>
    set((state) => {
      const next = new Map(state.filesCache);
      next.set(name, files);
      return { filesCache: next };
    }),

  updateSkillEnabled: (name, enabled) =>
    set((state) => ({
      skills: state.skills.map((s) =>
        s.name === name ? { ...s, enabled } : s
      ),
    })),

  removeSkill: (name) =>
    set((state) => ({
      skills: state.skills.filter((s) => s.name !== name),
      selectedSkill: state.selectedSkill === name ? null : state.selectedSkill,
      view: state.selectedSkill === name ? 'browse' : state.view,
    })),

  getFilteredSkills: () => {
    const { skills, searchQuery } = get();
    if (!searchQuery.trim()) return skills;
    const q = searchQuery.toLowerCase();
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.scope.toLowerCase().includes(q)
    );
  },
}));
