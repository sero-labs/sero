import { useEffect } from 'react';
import { useAppStore } from '@/stores/app';
import { useBrowserStore } from '@/stores/browser';
import { useExplorerStore } from '@/stores/explorer';
import { useWorkspaceStore } from '@/stores/workspace';
import { navigateBack, navigateForward } from '@/lib/open-app';

/**
 * Global keyboard shortcuts.
 *
 * ⌘B — Toggle main sidebar
 * ⌘L — Toggle chat panel
 * ⌘N — New browser tab (opens the Browser panel if not already active)
 * ⌘[ / ⌘] — Navigate back / forward
 * Mouse buttons 4/5 — Navigate back / forward
 */
function isBrowserPanelActive(): boolean {
  if (useAppStore.getState().activeApp !== 'explorer') return false;
  const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? 'global';
  return useExplorerStore.getState().get(workspaceId).activePanel === 'browser';
}

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
        case '[':
        case ']': {
          // The in-app browser owns ⌘[/⌘] for page history while its
          // panel is active (useBrowserShortcuts).
          if (isBrowserPanelActive()) return;
          e.preventDefault();
          if (e.key === '[') navigateBack();
          else navigateForward();
          break;
        }
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

    // Side mouse buttons (back = 3, forward = 4), like a browser.
    const mouseHandler = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault();
      if (e.button === 3) navigateBack();
      else navigateForward();
    };

    window.addEventListener('keydown', handler);
    window.addEventListener('mouseup', mouseHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('mouseup', mouseHandler);
    };
  }, [toggleMainSidebar, toggleChatPanel]);
}
