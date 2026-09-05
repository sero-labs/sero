/**
 * Push toggle — one row at the foot of the notification feed.
 *
 * It says what push does before it asks for permission, because a
 * browser only asks once. A phone that cannot do push says why.
 */

import { useCallback } from 'react';
import { BellRing, Loader2 } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import { usePushStore } from '@/stores/push';

export function PushToggle() {
  const state = usePushStore((s) => s.state);
  const reason = usePushStore((s) => s.reason);
  const enable = usePushStore((s) => s.enable);
  const disable = usePushStore((s) => s.disable);

  const toggle = useCallback(() => {
    if (state === 'on') void disable();
    else void enable();
  }, [state, enable, disable]);

  if (state === 'unavailable') {
    return (
      <div className="border-t border-[var(--border-subtle)] px-3 py-2">
        <p className="text-xs text-[var(--text-muted)]">
          {reason ?? 'This device cannot show notifications when Sero Remote is closed.'}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 border-t border-[var(--border-subtle)] px-3 py-2">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-primary)]">
          <BellRing className="size-3.5 shrink-0 text-[var(--text-muted)]" />
          On this device
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          {state === 'on'
            ? 'Sero can notify you with the app closed.'
            : reason ?? 'Get notified with the app closed.'}
        </p>
      </div>
      <Button
        size="sm"
        variant={state === 'on' ? 'outline' : 'default'}
        disabled={state === 'working'}
        onClick={toggle}
        data-testid="push-toggle"
      >
        {state === 'working' && <Loader2 className="size-3.5 animate-spin" />}
        {state === 'on' ? 'Turn off' : 'Turn on'}
      </Button>
    </div>
  );
}
