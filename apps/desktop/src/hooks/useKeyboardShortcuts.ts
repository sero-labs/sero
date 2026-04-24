import { useEffect } from 'react';
import { useAppStore } from '@/stores/app';
import { useBrowserStore } from '@/stores/browser';
import { useExplorerStore } from '@/stores/explorer';
import { useWorkspaceStore } from '@/stores/workspace';

/**
 * Global keyboard shortcuts.
 *
 * ⌘B — Toggle main sidebar
 * ⌘L — Toggle chat panel
 * ⌘N — New browser tab (opens the Browser panel if not already active)
 */
export function useKeyboardShortcuts() {
  const toggleMainSidebar = useAppStore((s) => s.toggleMainSidebar);
  const toggleChatPanel = useAppStore((s) => s.toggleChatPanel);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Only respond to ⌘ (Mac) or Ctrl (other platforms)
      if (!e.metaKey && !e.ctrlKey) return;
      // Ignore if other modifiers are held
      if (e.shiftKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case 'b':
          e.preventDefault();
          toggleMainSidebar();
          break;
        case 'l':
          e.preventDefault();
          toggleChatPanel();
          break;
        case 'n': {
          // Only handle ⌘N when the Explorer workspace is the active app,
          // so it doesn't hijack shortcuts inside other apps.
          if (useAppStore.getState().activeApp !== 'explorer') return;
          e.preventDefault();
          const workspaceId =
            useWorkspaceStore.getState().activeWorkspaceId ?? 'global';
          useExplorerStore
            .getState()
            .set(workspaceId, { activePanel: 'browser', sidebarOpen: false });
          useBrowserStore.getState().createTab(workspaceId);
          break;
        }
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleMainSidebar, toggleChatPanel]);
}
