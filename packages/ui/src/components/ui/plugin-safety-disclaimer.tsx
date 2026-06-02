import { ShieldAlert } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface PluginSafetyDisclaimerProps {
  className?: string;
}

export function PluginSafetyDisclaimer({ className }: PluginSafetyDisclaimerProps) {
  return (
    <div
      role="note"
      className={cn(
        'flex shrink-0 items-start gap-2 border-t border-status-warning-border bg-status-warning-faint px-4 py-2.5 text-[11px] leading-5 text-[var(--text-secondary)]',
        className,
      )}
    >
      <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-status-warning" />
      <p>
        <span className="font-medium text-status-warning">Heads up:</span>{' '}
        Plugins run with full access to this workspace and can execute code on your device.
        Only install plugins from sources you trust.
      </p>
    </div>
  );
}
