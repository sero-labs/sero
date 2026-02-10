import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { PlusIcon, CommandIcon } from 'lucide-react';
import { useProjectStore, type ProjectStatus } from '../stores/project-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useAgentStore } from '../stores/agent-store';
import { ProjectTab } from './ProjectTab';
import { SortableTab } from './SortableTab';
import { CommandBar } from './CommandBar';
import { Button } from './ui/button';
import { Kbd } from './ui/kbd';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Spinner } from './ui/spinner';

export function Shell() {
  const {
    activeProjectId,
    setActiveProject,
    addProject,
    removeProject,
    updateProject,
    reorderProjects,
    getProjectList,
  } = useProjectStore();

  const { initWorkspace, cleanupWorkspace, addSkillsPanel, addPackagesPanel, addSettingsPanel } = useWorkspaceStore();
  const { initProject: initAgentState, clearMessages } = useAgentStore();
  const projects = getProjectList();

  const [showCommandBar, setShowCommandBar] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [hasRestored, setHasRestored] = useState(false);

  // ── Restore persisted projects on first mount ─────────────
  useEffect(() => {
    if (hasRestored) return;
    setHasRestored(true);
    restoreProjects();
  }, [hasRestored]);

  async function restoreProjects() {
    try {
      const persisted = await window.sero.persistence.loadProjects();
      if (!persisted || persisted.length === 0) return;

      for (const p of persisted) {
        addProject({
          id: p.id, name: p.name, image: p.image, cpus: p.cpus,
          memoryMB: p.memoryMB, ports: p.ports, createdAt: p.createdAt,
          status: 'creating',
        });
        initWorkspace(p.id);
        initAgentState(p.id);

        try {
          const containerState = await window.sero.container.create({
            id: p.id, name: p.name, image: p.image,
            cpus: p.cpus, memoryMB: p.memoryMB, ports: p.ports,
          });
          await window.sero.agent.create(p.id);
          updateProject(p.id, { status: 'running', ipAddress: containerState?.ipAddress });
        } catch (err) {
          console.error(`Failed to restore project ${p.id}:`, err);
          updateProject(p.id, { status: 'error' });
        }
      }

      const savedActiveId = await window.sero.persistence.loadActiveProjectId();
      if (savedActiveId && persisted.some((p: any) => p.id === savedActiveId)) {
        setActiveProject(savedActiveId);
      } else if (persisted.length > 0) {
        setActiveProject(persisted[0].id);
      }
    } catch (err) {
      console.error('Failed to load persisted projects:', err);
    }
  }

  // Persist active project + update file watcher
  useEffect(() => {
    if (hasRestored && activeProjectId) {
      window.sero.persistence.saveActiveProjectId(activeProjectId);
    }
    window.sero.filetree.setActive(activeProjectId);
  }, [activeProjectId, hasRestored]);

  // ── Create project ────────────────────────────────────────
  const handleNewProject = useCallback(async () => {
    if (isCreating) return;
    setIsCreating(true);

    const id = `proj-${Date.now().toString(36)}`;
    const name = `Project ${projects.length + 1}`;
    const hostPort = 10000 + Math.floor(Math.random() * 50000);

    const project = {
      id, name, image: 'sero-node:latest',
      status: 'creating' as ProjectStatus,
      cpus: 2, memoryMB: 1024,
      ports: [{ host: hostPort, container: 3000 }],
      createdAt: Date.now(),
    };

    addProject(project);
    initWorkspace(id);
    initAgentState(id);

    try {
      const containerState = await window.sero.container.create({
        id, name, image: project.image,
        cpus: project.cpus, memoryMB: project.memoryMB, ports: project.ports,
      });
      await window.sero.agent.create(id);
      updateProject(id, { status: 'running', ipAddress: containerState?.ipAddress });
      window.sero.persistence.saveProject({
        id, name, image: project.image, cpus: project.cpus,
        memoryMB: project.memoryMB, ports: project.ports, createdAt: project.createdAt,
      });
    } catch (err) {
      console.error('Failed to create project:', err);
      updateProject(id, { status: 'error' });
    } finally {
      setIsCreating(false);
    }
  }, [projects.length, isCreating, addProject, initWorkspace, initAgentState, updateProject]);

  // ── Close project ─────────────────────────────────────────
  const handleCloseProject = useCallback(async (id: string) => {
    updateProject(id, { status: 'stopping' });
    try {
      await window.sero.agent.dispose(id);
      await window.sero.container.stop(id);
      await window.sero.container.remove(id);
    } catch (err) {
      console.error('Failed to close project:', err);
    }
    cleanupWorkspace(id);
    clearMessages(id);
    removeProject(id);
    window.sero.persistence.removeProject(id);
  }, [updateProject, removeProject, cleanupWorkspace, clearMessages]);

  // ── Keyboard shortcuts ────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'k') {
        e.preventDefault();
        setShowCommandBar((v) => !v);
      }
      if (e.metaKey && e.key === 'n') {
        e.preventDefault();
        handleNewProject();
      }
      if (e.metaKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const list = getProjectList();
        const idx = parseInt(e.key) - 1;
        if (list[idx]) setActiveProject(list[idx].id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleNewProject, getProjectList, setActiveProject]);

  // ── Tab drag-and-drop ─────────────────────────────────────
  const tabSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );
  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);

  const handleTabDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (over && active.id !== over.id) {
        const oldIndex = projectIds.indexOf(active.id as string);
        const newIndex = projectIds.indexOf(over.id as string);
        if (oldIndex !== -1 && newIndex !== -1) {
          reorderProjects(arrayMove(projectIds, oldIndex, newIndex));
        }
      }
    },
    [projectIds, reorderProjects],
  );

  const statusColor = (status: ProjectStatus): string => {
    const map: Record<ProjectStatus, string> = {
      running: '#22c55e',
      creating: '#f59e0b',
      stopping: '#f59e0b',
      error: '#ef4444',
      stopped: '#71717a',
    };
    return map[status] ?? '#71717a';
  };

  return (
    <TooltipProvider>
      <div className="flex flex-col h-screen w-screen bg-[var(--bg-base)]">
        {/* ── Title bar ──────────────────────────────────── */}
        <div className="drag-region flex items-center h-[52px] px-4 bg-[var(--bg-surface)] border-b border-[var(--border-subtle)] shrink-0">
          {/* Traffic light spacer */}
          <div className="w-[72px] shrink-0" />

          {/* Tabs */}
          <div className="no-drag flex items-center gap-0.5 flex-1 overflow-x-auto px-2 scrollbar-none">
            <DndContext
              sensors={tabSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleTabDragEnd}
            >
              <SortableContext items={projectIds} strategy={horizontalListSortingStrategy}>
                {projects.map((project) => (
                  <SortableTab
                    key={project.id}
                    id={project.id}
                    isActive={activeProjectId === project.id}
                    statusColor={statusColor(project.status)}
                    name={project.name}
                    onSelect={() => setActiveProject(project.id)}
                    onClose={() => handleCloseProject(project.id)}
                    onRename={(newName) => {
                      updateProject(project.id, { name: newName });
                      window.sero.persistence.updateProject(project.id, { name: newName });
                    }}
                  />
                ))}
              </SortableContext>
            </DndContext>

            {/* New project button */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="no-drag ml-1 text-muted-foreground"
                  onClick={handleNewProject}
                  disabled={isCreating}
                >
                  {isCreating ? <Spinner className="size-3.5" /> : <PlusIcon className="size-3.5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>New Project <Kbd>⌘N</Kbd></TooltipContent>
            </Tooltip>
          </div>

          {/* Command bar trigger */}
          <div className="no-drag">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="xs"
                  className="gap-1 text-muted-foreground"
                  onClick={() => setShowCommandBar(true)}
                >
                  <CommandIcon className="size-3" />
                  <span>K</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Command Palette <Kbd>⌘K</Kbd></TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* ── Workspace ──────────────────────────────────── */}
        <div className="flex-1 overflow-hidden relative">
          {projects.length === 0 ? (
            <EmptyState onNewProject={handleNewProject} isCreating={isCreating} />
          ) : (
            projects.map((project) => (
              <div
                key={project.id}
                className="absolute inset-0 flex-col"
                style={{ display: activeProjectId === project.id ? 'flex' : 'none' }}
              >
                <ProjectTab projectId={project.id} />
              </div>
            ))
          )}
        </div>

        {/* ── Command bar ────────────────────────────────── */}
        <CommandBar
          open={showCommandBar}
          onOpenChange={setShowCommandBar}
          onNewProject={handleNewProject}
          onOpenSkills={() => { if (activeProjectId) addSkillsPanel(activeProjectId); }}
          onOpenPackages={() => { if (activeProjectId) addPackagesPanel(activeProjectId); }}
          onOpenSettings={() => { if (activeProjectId) addSettingsPanel(activeProjectId); }}
        />
      </div>
    </TooltipProvider>
  );
}

/* ── Empty state ─────────────────────────────────────────────── */

function EmptyState({ onNewProject, isCreating }: { onNewProject: () => void; isCreating: boolean }) {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold tracking-tight text-foreground">Sero</h1>
        <p className="text-base text-muted-foreground">Zero context switch, zero sprawl.</p>
        <Button size="lg" onClick={onNewProject} disabled={isCreating} className="mt-2">
          {isCreating ? <><Spinner className="size-4" /> Creating…</> : 'Create Project'}
        </Button>
      </div>
    </div>
  );
}
