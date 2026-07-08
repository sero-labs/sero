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
/**
 * When the Browser panel is showing a tab, that tab owns back/forward for
 * page history (⌘[/⌘] via useBrowserShortcuts, mouse buttons here). Returns
 * the active tab id in that case, else null — so with no open tab the keys
 * fall through to app-history navigation instead of becoming dead keys.
 */
function browserHistoryTabId(): string | null {
  if (useAppStore.getState().activeApp !== 'explorer') return null;
  const workspaceId = useWorkspaceStore.getState().activeWorkspaceId ?? 'global';
  if (useExplorerStore.getState().get(workspaceId).activePanel !== 'browser') return null;
  return useBrowserStore.getState().activeTabIds[workspaceId] ?? null;
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
          // A focused browser tab owns ⌘[/⌘] for page history
          // (useBrowserShortcuts). With no open tab, navigate app history.
          if (browserHistoryTabId()) return;
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

    // Side mouse buttons (back = 3, forward = 4), like a browser. Mirror the
    // ⌘[/⌘] rule: a focused browser tab gets page history, otherwise the app
    // history moves. (Clicks over the web page reach the native view directly;
    // this only fires for clicks over the surrounding Sero chrome.)
    const mouseHandler = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return;
      e.preventDefault();
      const tabId = browserHistoryTabId();
      const back = e.button === 3;
      if (tabId) {
        const browser = useBrowserStore.getState();
        if (back) browser.goBack(tabId);
        else browser.goForward(tabId);
      } else if (back) {
        navigateBack();
      } else {
        navigateForward();
      }
    };

    window.addEventListener('keydown', handler);
    window.addEventListener('mouseup', mouseHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('mouseup', mouseHandler);
    };
  }, [toggleMainSidebar, toggleChatPanel]);
}
