import { useState, type SyntheticEvent } from 'react';
import { Box, Check, ChevronRight, Loader2, Monitor, Server } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero-ai/ui/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@sero-ai/ui/components/ui/dialog';
import { cn } from '@sero-ai/ui/lib/utils';
import { IconAction } from '@/components/ui/IconAction';
import { DoctorPanel } from '@/components/diagnostics/DoctorPanel';
import { useWorkspaceStore } from '@/stores/workspace';
import type { WorkspaceInfo } from '@/types/ipc';
import type { DeprecatedWorkspaceRuntimeBackend, WorkspaceRuntimeBackend } from '@/types/workspace-runtime';

interface RuntimeOption {
  backend: WorkspaceRuntimeBackend;
  name: string;
  description: string;
  recommended?: boolean;
  optional?: boolean;
  disabled?: boolean;
}

const APPLE_CONTAINER_COPY = 'Explicit Apple-native container runtime on supported Macs. Adds isolation, Linux parity, native build dependencies, and preinstalled browser automation.';
const DOCKER_COPY = 'Explicit container runtime for macOS, Windows, and Linux. Adds Linux/container parity, image-provided tools, and preinstalled browser automation.';
const HOST_DEFAULT_COPY = 'Default local runtime. Runs commands in your workspace folder using compatible system tools. No container isolation.';
const HOST_OPTION_COPY = 'Local runtime. Runs commands in your workspace folder using compatible system tools. No container isolation.';

function isHostDefaultSupported(platform: string, arch: string): boolean {
  return (
    (platform === 'darwin' && arch === 'arm64') ||
    (platform === 'linux' && (arch === 'x64' || arch === 'arm64')) ||
    (platform === 'win32' && arch === 'x64')
  );
}

type RuntimeBackendForDisplay = WorkspaceRuntimeBackend | DeprecatedWorkspaceRuntimeBackend;

export function runtimeName(backend: RuntimeBackendForDisplay): string {
  if (backend === 'apple-container') return 'Apple Container';
  if (backend === 'docker') return 'Docker / Podman';
  return 'Host';
}

function runtimeIcon(backend: RuntimeBackendForDisplay) {
  // Deprecated compatibility input; normalize to host on write.
  if (backend === 'host' || backend === 'mac-host') return <Monitor className="size-3" />;
  if (backend === 'docker') return <Server className="size-3" />;
  return <Box className="size-3" />;
}

function stopRuntimeTriggerPropagation(event: SyntheticEvent): void {
  event.stopPropagation();
}

export function getRuntimePickerOptions(platform: string, arch: string): RuntimeOption[] {
  const hostIsDefault = isHostDefaultSupported(platform, arch);
  const hostOption: RuntimeOption = {
    backend: 'host',
    name: 'Host',
    description: hostIsDefault ? HOST_DEFAULT_COPY : HOST_OPTION_COPY,
    recommended: hostIsDefault,
    optional: !hostIsDefault,
  };
  const dockerOption: RuntimeOption = {
    backend: 'docker',
    name: 'Docker / Podman',
    description: DOCKER_COPY,
    recommended: !hostIsDefault,
    optional: hostIsDefault,
  };

  if (platform === 'darwin' && arch === 'arm64') {
    return [
      hostOption,
      { backend: 'apple-container', name: 'Apple Container', description: APPLE_CONTAINER_COPY, optional: true },
      dockerOption,
    ];
  }

  return [hostOption, dockerOption];
}

export function RuntimePickerMenu({ workspace }: { workspace: WorkspaceInfo }) {
  const setRuntimeBackend = useWorkspaceStore((state) => state.setRuntimeBackend);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [doctorOpen, setDoctorOpen] = useState(false);
  const [pendingBackend, setPendingBackend] = useState<WorkspaceRuntimeBackend | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const platform = window.sero.platform;
  const arch = window.sero.arch;
  const options = getRuntimePickerOptions(platform, arch);
  const current = workspace.runtime.backend as RuntimeBackendForDisplay;
  const currentBackend: WorkspaceRuntimeBackend = current === 'mac-host' ? 'host' : current;
  const currentName = runtimeName(current);

  const handleSelect = async (option: RuntimeOption) => {
    if (option.disabled || option.backend === currentBackend || pendingBackend) return;
    setPendingBackend(option.backend);
    setErrorMessage(null);
    setStatusMessage(`Switching ${workspace.name} to ${option.name}…`);
    try {
      await setRuntimeBackend(workspace.id, option.backend);
      setStatusMessage(`${workspace.name} is switching to ${option.name}. Runtime processes are being reset.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : `Failed to switch to ${option.name}`);
      setStatusMessage(null);
    } finally {
      setPendingBackend(null);
    }
  };

  const openDoctor = (event: SyntheticEvent) => {
    event.stopPropagation();
    setPickerOpen(false);
    setDoctorOpen(true);
  };

  return (
    <>
      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <IconAction
            as="span"
            role="button"
            tabIndex={-1}
            title={`Runtime: ${currentName}`}
            onClick={stopRuntimeTriggerPropagation}
            onPointerDown={stopRuntimeTriggerPropagation}
            onKeyDown={stopRuntimeTriggerPropagation}
          >
            {runtimeIcon(current)}
          </IconAction>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          side="bottom"
          className="w-80 p-0 shadow-xl"
          onClick={(event) => event.stopPropagation()}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="border-b border-[var(--border-subtle)] px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Workspace runtime</p>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {isHostDefaultSupported(platform, arch)
                ? 'Host is the normal default for local work. Select a container runtime explicitly when you want container tools, isolation, or parity.'
                : 'Docker / Podman is the default on this platform. Choose Host only when your system tools support the workspace.'}
            </p>
          </div>

          <div className="space-y-1 p-1.5">
            {options.map((option) => {
              const selected = currentBackend === option.backend;
              const pending = pendingBackend === option.backend;
              return (
                <button
                  key={option.backend}
                  type="button"
                  onClick={() => void handleSelect(option)}
                  disabled={option.disabled || Boolean(pendingBackend)}
                  aria-current={selected ? 'true' : undefined}
                  className={cn(
                    'group flex w-full items-start gap-2 rounded-lg border px-2.5 py-2.5 text-left transition-all duration-150',
                    'border-transparent hover:border-[var(--accent-primary)] hover:bg-[var(--status-info-faint)] hover:shadow-sm',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]',
                    'disabled:cursor-not-allowed disabled:opacity-60',
                    selected && 'border-[var(--accent-primary)] bg-[var(--status-info-faint)]',
                    pending && 'border-[var(--status-info)] bg-[var(--status-info-muted)]',
                  )}
                >
                  <span className={cn(
                    'mt-0.5 rounded-md p-1 text-[var(--text-muted)] transition-colors group-hover:bg-[var(--bg-base)] group-hover:text-[var(--accent-primary)]',
                    selected && 'bg-[var(--bg-base)] text-[var(--accent-primary)]',
                  )}
                  >
                    {runtimeIcon(option.backend)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex max-w-full flex-wrap items-center gap-1 text-sm font-medium text-[var(--text-primary)]">
                      {option.name}
                      {pending ? (
                        <span className="rounded bg-[var(--bg-base)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--status-info)]">
                          Switching
                        </span>
                      ) : null}
                      {option.recommended ? (
                        <span className="rounded bg-[var(--status-success-faint)] px-1 py-0.5 text-[10px] uppercase tracking-wide text-[var(--status-success)]">
                          Default
                        </span>
                      ) : null}
                      {option.optional ? (
                        <span className="rounded bg-[var(--bg-base)] px-1 py-0.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                          Optional
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-[var(--text-muted)]">
                      {option.description}
                    </span>
                  </span>
                  {pending ? (
                    <Loader2 className="mt-1 size-3.5 animate-spin text-[var(--status-info)]" />
                  ) : selected ? (
                    <Check className="mt-1 size-3.5 text-[var(--accent-primary)]" />
                  ) : null}
                </button>
              );
            })}
          </div>

          {(statusMessage || errorMessage) ? (
            <div className={cn(
              'mx-2 mb-2 rounded-md border px-2 py-1.5 text-xs',
              errorMessage
                ? 'border-[var(--status-error-border)] bg-[var(--status-error-faint)] text-[var(--status-error)]'
                : 'border-[var(--status-info-border)] bg-[var(--status-info-faint)] text-[var(--text-secondary)]',
            )}
            >
              {errorMessage ?? statusMessage}
            </div>
          ) : null}

          <div className="border-t border-[var(--border-subtle)] p-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 w-full justify-between text-xs hover:border-[var(--accent-primary)] hover:bg-[var(--status-info-faint)]"
              onClick={openDoctor}
            >
              Open Environment Doctor
              <ChevronRight className="size-3" />
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={doctorOpen} onOpenChange={setDoctorOpen}>
        <DialogContent className="flex h-[min(88vh,52rem)] max-w-5xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
          <DialogHeader className="border-b border-border px-4 py-3 pr-12">
            <DialogTitle>Environment Doctor</DialogTitle>
            <DialogDescription>
              Run diagnostics for Sero, profiles, providers, plugins, and runtime setup.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto">
            <DoctorPanel />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
