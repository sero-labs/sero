/**
 * Theme cycle button — dark → light → system, matching the desktop
 * status-bar control. Lives in the status bar on desktop and in the
 * title bar on mobile, where the status bar is hidden.
 */

import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { useThemeStore } from '@/stores/theme';

export function ThemeModeButton() {
  const mode = useThemeStore((s) => s.mode);
  const cycleMode = useThemeStore((s) => s.cycleMode);

  const Icon = mode === 'dark' ? Moon : mode === 'light' ? Sun : Monitor;
  const label = mode === 'dark' ? 'Dark' : mode === 'light' ? 'Light' : 'System';

  return (
    <Button
      onClick={cycleMode}
      variant="ghost"
      size="icon-xs"
      title={`Theme: ${label} (click to change)`}
      aria-label={`Theme: ${label}. Click to change.`}
    >
      <Icon className="size-3" />
    </Button>
  );
}
