import { ExternalLink, TriangleAlert } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import type { OnboardingContainerRuntime } from '@/types/ipc';

function runtimeName(runtime: OnboardingContainerRuntime): string {
  return runtime.runtime === 'apple-container' ? 'Apple Container' : 'Docker / Podman';
}

export function ContainerRuntimeNotice({
  runtime,
}: {
  runtime: OnboardingContainerRuntime;
}) {
  if (runtime.status === 'available') {
    return null;
  }

  return (
    <div className="rounded-xl border border-[var(--status-warning)]/25 bg-[var(--status-warning)]/6 p-3 text-sm text-[var(--text-secondary)]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-elevated)]">
          <TriangleAlert className="size-4 text-[var(--status-warning)]" />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="space-y-1">
            <p className="font-medium text-[var(--text-primary)]">Containers are not set up</p>
            <p>
              Sero can continue in Host mode. Set up {runtimeName(runtime)} later if you want container isolation, Linux parity, and preinstalled browser tooling.
            </p>
            <p className="text-xs text-[var(--text-muted)]">{runtime.message}</p>
          </div>

          {runtime.docsUrl ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => void window.sero.shell.openExternal(runtime.docsUrl!)}
            >
              <ExternalLink className="mr-1.5 size-3" />
              Container setup guide
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
