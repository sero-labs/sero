import React, { useCallback, useState } from 'react';
import {
  Loader2,
  CircleAlert,
  Globe,
  Cpu,
  MemoryStick,
  Container,
} from 'lucide-react';
import { useProjectStore } from '../stores/project-store';
import { TiledWorkspace } from './TiledWorkspace';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Spinner } from './ui/spinner';

interface Props {
  projectId: string;
}

export function ProjectTab({ projectId }: Props) {
  const project = useProjectStore((s) => s.projects.get(projectId));
  const updateProject = useProjectStore((s) => s.updateProject);
  const [retrying, setRetrying] = useState(false);

  const handleRetry = useCallback(async () => {
    if (retrying || !project) return;
    setRetrying(true);
    updateProject(projectId, { status: 'creating' });
    try {
      const containerState = await window.sero.container.create({
        id: projectId,
        name: project.name,
        image: project.image,
        cpus: project.cpus,
        memoryMB: project.memoryMB,
        ports: project.ports,
      });
      await window.sero.agent.create(projectId);
      updateProject(projectId, { status: 'running', ipAddress: containerState?.ipAddress });
    } catch (err) {
      console.error('Retry failed:', err);
      updateProject(projectId, { status: 'error' });
    } finally {
      setRetrying(false);
    }
  }, [projectId, project, retrying, updateProject]);

  // Loading state
  if (!project || project.status === 'creating') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Spinner className="size-6" />
        <p className="text-sm font-medium text-foreground">Spinning up container…</p>
        <p className="text-xs text-muted-foreground">
          Booting {project?.image ?? 'Linux VM'} · {project?.cpus ?? 2} CPUs · {project?.memoryMB ?? 1024}MB
        </p>
      </div>
    );
  }

  // Error state
  if (project.status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <CircleAlert className="size-8 text-destructive" />
        <p className="text-sm font-medium text-destructive">Container failed to start</p>
        <p className="text-xs text-muted-foreground">
          The container could not be created or reconnected.
        </p>
        <Button variant="outline" size="sm" onClick={handleRetry} disabled={retrying}>
          {retrying ? <><Spinner className="size-3.5" /> Retrying…</> : 'Retry'}
        </Button>
      </div>
    );
  }

  // Running state
  return (
    <div className="flex flex-col w-full h-full overflow-hidden">
      <div className="flex-1 overflow-hidden">
        <TiledWorkspace projectId={projectId} />
      </div>
      <StatusBar project={project} />
    </div>
  );
}

/* ── Status Bar ─────────────────────────────────────────────── */

function StatusBar({ project }: { project: ReturnType<typeof useProjectStore.getState>['projects'] extends Map<string, infer V> ? V : never }) {
  return (
    <TooltipProvider>
      <div className="flex items-center gap-3 h-[26px] px-3 bg-[var(--bg-base)] border-t border-[var(--border-subtle)] text-[11px] text-muted-foreground shrink-0">
        {/* Container status */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1.5 cursor-default">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span>{project.image}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>Container image</TooltipContent>
        </Tooltip>

        {/* Resources */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="flex items-center gap-1 cursor-default">
              <Cpu className="size-3" />
              <span>{project.cpus}</span>
              <span className="text-muted-foreground/60 mx-0.5">·</span>
              <MemoryStick className="size-3" />
              <span>{project.memoryMB}MB</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>{project.cpus} CPUs · {project.memoryMB}MB RAM</TooltipContent>
        </Tooltip>

        {/* IP Address */}
        {project.ipAddress && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="flex items-center gap-1 text-primary font-medium hover:text-primary/80 transition-colors"
                onClick={() => navigator.clipboard.writeText(project.ipAddress!)}
              >
                <Globe className="size-3" />
                <span>{project.ipAddress}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>Click to copy IP address</TooltipContent>
          </Tooltip>
        )}

        {/* Port mappings */}
        {project.ports.map((p) => (
          <Badge key={p.container} variant="outline" className="h-4 text-[10px] px-1.5 font-mono">
            :{p.container} → :{p.host}
          </Badge>
        ))}
      </div>
    </TooltipProvider>
  );
}
