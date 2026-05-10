import { ExternalLink, TriangleAlert } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import type { OnboardingContainerRuntime } from '@/types/ipc';

const LIMITATIONS = [
  'Browser automation',
  'Runtime language servers',
  'Managed preview and dev-server automation',
] as const;

export function ContainerRuntimeNotice({
  runtime,
}: {
  runtime: OnboardingContainerRuntime;
}) {
  if (runtime.status === 'available') {
    return null;
  }

  return (
    <div className="rounded-xl border border-[var(--status-warning)]/25 bg-[var(--status-warning)]/6 p-4 text-sm text-[var(--text-secondary)]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-elevated)]">
          <TriangleAlert className="size-4.5 text-[var(--status-warning)]" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <p className="font-medium text-[var(--text-primary)]">Workspace runtime setup recommended for full Sero features</p>
            <p>{runtime.message}</p>
            <p>Docker remains the most isolated runtime on Windows and Linux. Host is available without containers; Windows Host requires WSL 2.</p>
          </div>

          <ul className="list-disc space-y-1 pl-5 text-xs marker:text-[var(--status-warning)]">
            {LIMITATIONS.map((item) => (
              <li key={item}>{item} may be limited until Docker or Apple Container is configured.</li>
            ))}
          </ul>

          {runtime.docsUrl ? (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void window.sero.shell.openExternal(runtime.docsUrl!)}
              >
                <ExternalLink className="mr-2 size-3.5" />
                Set up runtime
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
