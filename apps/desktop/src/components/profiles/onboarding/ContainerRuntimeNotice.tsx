import { ExternalLink, TriangleAlert } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import type { OnboardingContainerRuntime } from '@/types/ipc';

const OPTIONAL_CONTAINER_BENEFITS = [
  'Isolated Linux runtime',
  'Native build tools and Linux parity',
  'Preinstalled browser automation',
] as const;

function containerTarget(runtime: OnboardingContainerRuntime): string {
  return runtime.runtime === 'apple-container' ? 'Docker or Apple Container' : 'Docker';
}

function runtimeSummary(runtime: OnboardingContainerRuntime): string {
  if (runtime.runtime === 'apple-container') {
    return 'Host is the recommended fast local runtime and can install missing Sero-managed tools automatically. Apple Container or Docker are optional upgrades for sandboxing, Linux parity, native build tools, and preinstalled browsers.';
  }
  if (window.sero.platform === 'win32') {
    return 'Host is the recommended fast local runtime on Windows too. Docker Desktop is optional when you want container isolation, Linux parity, native build tools, or preinstalled browsers.';
  }
  return 'Host is the recommended fast local runtime and can install missing Sero-managed tools automatically. Docker remains optional for sandboxing, Linux parity, native build tools, and preinstalled browsers.';
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
            <p className="font-medium text-[var(--text-primary)]">Optional container runtime setup</p>
            <p>{runtime.message}</p>
            <p>{runtimeSummary(runtime)}</p>
          </div>

          <ul className="list-disc space-y-1 pl-5 text-xs marker:text-[var(--status-warning)]">
            {OPTIONAL_CONTAINER_BENEFITS.map((item) => (
              <li key={item}>{item} is available by selecting {containerTarget(runtime)} later.</li>
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
                Set up optional container runtime
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
