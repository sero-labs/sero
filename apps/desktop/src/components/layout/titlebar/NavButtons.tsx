import { Button } from '@sero-ai/ui/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sero-ai/ui/components/ui/tooltip';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useAppStore } from '@/stores/app';
import { useNavigationStore, type NavEntry } from '@/stores/navigation';
import { navigateBack, navigateForward } from '@/lib/open-app';

/** Back/forward buttons over the navigation history (⌘[ / ⌘], mouse buttons 4/5). */
export function NavButtons() {
  const entries = useNavigationStore((s) => s.entries);
  const index = useNavigationStore((s) => s.index);
  const apps = useAppStore((s) => s.apps);

  const labelFor = (entry: NavEntry | undefined) =>
    apps.find((app) => app.id === entry?.appId)?.label;

  const backTarget = index > 0 ? labelFor(entries[index - 1]) : undefined;
  const forwardTarget = index < entries.length - 1 ? labelFor(entries[index + 1]) : undefined;

  return (
    <>
      <NavButton
        label={backTarget ? `Back to ${backTarget}` : 'Back'}
        disabled={!backTarget}
        onClick={navigateBack}
      >
        <ChevronLeft className="size-4" />
      </NavButton>
      <NavButton
        label={forwardTarget ? `Forward to ${forwardTarget}` : 'Forward'}
        disabled={!forwardTarget}
        onClick={navigateForward}
      >
        <ChevronRight className="size-4" />
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
