import { create } from 'zustand';

// ── Apps ───────────────────────────────────────────────────────
export type AppId = 'coding' | 'calendar' | 'todos' | 'fitness' | 'banking';

export interface AppEntry {
  id: AppId;
  label: string;
  icon: string; // emoji for now, swap for Lucide later
}

export const apps: AppEntry[] = [
  { id: 'coding', label: 'Coding', icon: '💻' },
  { id: 'calendar', label: 'Calendar', icon: '📅' },
  { id: 'todos', label: 'Todos', icon: '✅' },
  { id: 'fitness', label: 'Fitness', icon: '💪' },
  { id: 'banking', label: 'Banking', icon: '🏦' },
];

// ── Chat sessions (placeholder data) ──────────────────────────
export interface ChatSession {
  id: string;
  title: string;
  preview: string;
  date: string;
}

export const dummyChatSessions: ChatSession[] = [
  { id: '1', title: 'Refactor auth module', preview: 'Can you help me split the auth...', date: 'Today' },
  { id: '2', title: 'CSS grid layout', preview: 'I need a responsive grid that...', date: 'Today' },
  { id: '3', title: 'Debug API timeout', preview: 'The /api/users endpoint keeps...', date: 'Yesterday' },
  { id: '4', title: 'Write unit tests', preview: 'Generate tests for the utils...', date: 'Yesterday' },
  { id: '5', title: 'Docker compose setup', preview: 'Help me configure a multi-service...', date: 'Mon' },
  { id: '6', title: 'Performance profiling', preview: 'The app is slow on initial load...', date: 'Mon' },
];

// ── Theme ──────────────────────────────────────────────────────
export type Theme = 'dark' | 'light';

// ── Store ──────────────────────────────────────────────────────
interface AppState {
  // Main sidebar
  mainSidebarOpen: boolean;
  toggleMainSidebar: () => void;

  // Chat panel
  chatPanelOpen: boolean;
  toggleChatPanel: () => void;

  // Active app
  activeApp: AppId;
  setActiveApp: (app: AppId) => void;

  // Chat search
  chatSearch: string;
  setChatSearch: (q: string) => void;

  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export const useAppStore = create<AppState>((set, get) => ({
  // Main sidebar
  mainSidebarOpen: true,
  toggleMainSidebar: () => set((s) => ({ mainSidebarOpen: !s.mainSidebarOpen })),

  // Chat panel
  chatPanelOpen: true,
  toggleChatPanel: () => set((s) => ({ chatPanelOpen: !s.chatPanelOpen })),

  // Active app
  activeApp: 'coding',
  setActiveApp: (app) => set({ activeApp: app }),

  // Chat search
  chatSearch: '',
  setChatSearch: (q) => set({ chatSearch: q }),

  // Theme
  theme: 'dark',
  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    set({ theme: next });
  },
}));
