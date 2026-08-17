import { Button } from '@sero-ai/ui/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sero-ai/ui/components/ui/tooltip';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppStore } from '@/stores/app';
import { useWorkspaceStore } from '@/stores/workspace';
import { isAppEntrySupported } from '@/stores/app/shared';
import { findNavigationTarget, useNavigationStore, type NavEntry } from '@/stores/navigation';
import { navigateBack, navigateForward } from '@/lib/open-app';

/** Back/forward buttons over the navigation history (⌘[ / ⌘], mouse buttons 4/5). */
export function NavButtons() {
  const entries = useNavigationStore((s) => s.entries);
  const index = useNavigationStore((s) => s.index);
  const apps = useAppStore((s) => s.apps);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const appIds = new Set<string>();
  for (const app of apps) {
    if (isAppEntrySupported(app)) appIds.add(app.id);
  }
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));

  const labelFor = (entry: NavEntry | undefined) =>
    apps.find((app) => app.id === entry?.appId)?.label;
  const canUse = (entry: NavEntry) => {
    return appIds.has(entry.appId) && (!entry.workspaceId || workspaceIds.has(entry.workspaceId));
  };

  const backTarget = findNavigationTarget(entries, index, -1, canUse);
  const forwardTarget = findNavigationTarget(entries, index, 1, canUse);
  const backLabel = labelFor(backTarget?.entry);
  const forwardLabel = labelFor(forwardTarget?.entry);

  return (
    <>
      <NavButton
        label={backLabel ? `Back to ${backLabel}` : 'Back'}
        disabled={!backTarget}
        onClick={navigateBack}
      >
        <ChevronLeft className="size-5" />
      </NavButton>
      <NavButton
        label={forwardLabel ? `Forward to ${forwardLabel}` : 'Forward'}
        disabled={!forwardTarget}
        onClick={navigateForward}
      >
        <ChevronRight className="size-5" />
      </NavButton>
    </>
  );
}

function NavButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={disabled}
          onClick={onClick}
          aria-label={label}
          className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] disabled:opacity-35"
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="chrome-zoom-invariant">{label}</TooltipContent>
    </Tooltip>
  );
}
