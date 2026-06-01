import { ArrowUpCircle, Loader2 } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sero-ai/ui/components/ui/tooltip';
import { useUpdaterStatus } from '@/hooks/useUpdaterStatus';

/**
 * Title-bar auto-update affordance. Renders nothing unless an update is in
 * flight: a spinner while downloading, and a "Restart to update" button once
 * the update is downloaded and ready to install.
 */
export function UpdateIndicator() {
  const status = useUpdaterStatus();

  if (status.state === 'downloaded') {
    const tip = status.version
      ? `Update ${status.version} is ready, restart to install`
      : 'Update ready, restart to install';
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => void window.sero.updater.restartToUpdate()}
            className="no-drag gap-1 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            <ArrowUpCircle className="size-3.5" />
            Restart to update
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{tip}</TooltipContent>
      </Tooltip>
    );
  }

  if (status.state === 'available' || status.state === 'downloading') {
    const label =
      status.state === 'downloading' && typeof status.percent === 'number'
        ? `Downloading update... ${status.percent}%`
        : 'Downloading update...';
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="no-drag flex items-center text-[var(--text-muted)]"
            aria-label={label}
          >
            <Loader2 className="size-3.5 animate-spin" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </Tooltip>
    );
  }

  return null;
}
