import { create } from 'zustand';

export interface PackageInfo {
  source: string;
  scope: 'global' | 'project';
}

export interface ResolvedPackageResource {
  path: string;
  source: string;
}

export interface ResolvedResources {
  extensions: ResolvedPackageResource[];
  skills: ResolvedPackageResource[];
  prompts: ResolvedPackageResource[];
  themes: ResolvedPackageResource[];
}

export type PackagesView = 'browse' | 'install';

interface PackageStore {
  packages: PackageInfo[];
  resolved: ResolvedResources | null;
  view: PackagesView;
  isLoading: boolean;
  searchQuery: string;

  setPackages: (packages: PackageInfo[]) => void;
  setResolved: (resolved: ResolvedResources) => void;
  setView: (view: PackagesView) => void;
  setLoading: (loading: boolean) => void;
  setSearchQuery: (query: string) => void;
  removePackage: (source: string) => void;

  getFilteredPackages: () => PackageInfo[];
}

export const usePackageStore = create<PackageStore>((set, get) => ({
  packages: [],
  resolved: null,
  view: 'browse',
  isLoading: false,
  searchQuery: '',

  setPackages: (packages) => set({ packages }),

  setResolved: (resolved) => set({ resolved }),

  setView: (view) => set({ view }),

  setLoading: (isLoading) => set({ isLoading }),

  setSearchQuery: (searchQuery) => set({ searchQuery }),

  removePackage: (source) =>
    set((state) => ({
      packages: state.packages.filter((p) => p.source !== source),
    })),

  getFilteredPackages: () => {
    const { packages, searchQuery } = get();
    if (!searchQuery.trim()) return packages;
    const q = searchQuery.toLowerCase();
    return packages.filter(
      (p) =>
        p.source.toLowerCase().includes(q) ||
        p.scope.toLowerCase().includes(q)
    );
  },
}));
