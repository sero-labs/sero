import type { SyntheticEvent } from 'react';
import { Box, Check, ChevronRight, Monitor, Server } from 'lucide-react';
import { Button } from '@sero-ai/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@sero-ai/ui/components/ui/popover';
import { IconAction } from '@/components/ui/IconAction';
import { useWorkspaceStore } from '@/stores/workspace';
import type { WorkspaceInfo } from '@/types/ipc';
import type { DeprecatedWorkspaceRuntimeBackend, WorkspaceRuntimeBackend } from '@/types/workspace-runtime';

interface RuntimeOption {
  backend: WorkspaceRuntimeBackend;
  name: string;
  description: string;
  advanced?: boolean;
  disabled?: boolean;
}

const APPLE_CONTAINER_COPY = 'Recommended on Apple Silicon Macs. Live-mounted Linux workspace using Apple Container.';
const DOCKER_COPY = 'Portable Linux workspace for macOS Intel, Windows, and Linux. Requires Docker Desktop or Docker Engine.';
const HOST_COPY = 'Run directly on this computer. Fastest startup, least isolated.';

type RuntimeBackendForDisplay = WorkspaceRuntimeBackend | DeprecatedWorkspaceRuntimeBackend;

export function runtimeName(backend: RuntimeBackendForDisplay): string {
  if (backend === 'apple-container') return 'Apple Container';
  if (backend === 'docker') return 'Docker';
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

export function getRuntimePickerOptions(platform: string): RuntimeOption[] {
  const hostOption: RuntimeOption = {
    backend: 'host',
    name: 'Host',
    description: HOST_COPY,
    advanced: true,
  };

  if (platform === 'darwin') {
    return [
      { backend: 'apple-container', name: 'Apple Container', description: APPLE_CONTAINER_COPY },
      { backend: 'docker', name: 'Docker', description: DOCKER_COPY },
      hostOption,
    ];
  }

  if (platform === 'win32') {
    return [{ backend: 'docker', name: 'Docker', description: DOCKER_COPY }];
  }

  return [
    { backend: 'docker', name: 'Docker', description: DOCKER_COPY },
    hostOption,
  ];
}

export function RuntimePickerMenu({ workspace }: { workspace: WorkspaceInfo }) {
  const setRuntimeBackend = useWorkspaceStore((state) => state.setRuntimeBackend);
  const platform = window.sero.platform;
  const options = getRuntimePickerOptions(platform);
  const current = workspace.runtime.backend as RuntimeBackendForDisplay;
  const currentName = runtimeName(current);

  const handleSelect = async (option: RuntimeOption) => {
    if (option.disabled || option.backend === current) return;
    await setRuntimeBackend(workspace.id, option.backend);
  };

  return (
    <Popover>
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
        className="w-80 p-0"
        onClick={(event) => event.stopPropagation()}
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="border-b border-[var(--border-subtle)] px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Workspace runtime</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Changing the runtime or preview port pool requires recreating the runtime/container because port publications are fixed when it starts.
          </p>
        </div>

        <div className="p-1">
          {options.map((option) => (
            <button
              key={option.backend}
              type="button"
              onClick={() => void handleSelect(option)}
              disabled={option.disabled}
              className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-[var(--bg-elevated)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="mt-0.5 text-[var(--text-muted)]">{runtimeIcon(option.backend)}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-sm font-medium text-[var(--text-primary)]">
                  {option.name}
                  {option.advanced ? (
                    <span className="rounded bg-[var(--bg-base)] px-1 py-0.5 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                      Advanced
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-[var(--text-muted)]">
                  {option.description}
                </span>
              </span>
              {current === option.backend ? <Check className="mt-0.5 size-3.5 text-[var(--accent-primary)]" /> : null}
            </button>
          ))}
        </div>

        <div className="border-t border-[var(--border-subtle)] p-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 w-full justify-between text-xs"
            onClick={() => void window.sero.doctor.runQuick()}
          >
            Run Doctor
            <ChevronRight className="size-3" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
