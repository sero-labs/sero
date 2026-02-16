import { useEffect } from 'react';
import { useAppStore } from '@/stores/app';

/**
 * Global keyboard shortcuts.
 *
 * ⌘B — Toggle main sidebar
 * ⌘L — Toggle chat panel
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
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggleMainSidebar, toggleChatPanel]);
}
