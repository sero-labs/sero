import { ExternalLink, TriangleAlert } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import type { OnboardingContainerRuntime } from '@/types/ipc';

const LIMITATIONS = [
  'Browser automation',
  'Runtime language servers',
  'Managed preview and dev-server automation',
] as const;

function runtimeSummary(runtime: OnboardingContainerRuntime): string {
  if (runtime.runtime === 'apple-container') {
    return 'Docker remains available as an isolated runtime on macOS. Host is available without containers, but browser automation and Linux-parity tooling require Docker or Apple Container.';
  }
  if (window.sero.platform === 'win32') {
    return 'Docker Desktop provides the most isolated runtime on Windows. Host runtime uses WSL 2; install Ubuntu/WSL 2 if you want host-mode parity without containers.';
  }
  return 'Docker provides the most isolated runtime on Linux. Host runtime is available without containers for local shell, file, Git, LSP, and dev-server workflows.';
}

function limitationTarget(runtime: OnboardingContainerRuntime): string {
  return runtime.runtime === 'apple-container' ? 'Docker or Apple Container' : 'Docker';
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
    <div className="rounded-xl border border-[var(--status-warning)]/25 bg-[var(--status-warning)]/6 p-4 text-sm text-[var(--text-secondary)]">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-[var(--bg-elevated)]">
          <TriangleAlert className="size-4.5 text-[var(--status-warning)]" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <p className="font-medium text-[var(--text-primary)]">Workspace runtime setup recommended for full Sero features</p>
            <p>{runtime.message}</p>
            <p>{runtimeSummary(runtime)}</p>
          </div>

          <ul className="list-disc space-y-1 pl-5 text-xs marker:text-[var(--status-warning)]">
            {LIMITATIONS.map((item) => (
              <li key={item}>{item} may be limited until {limitationTarget(runtime)} is configured.</li>
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
