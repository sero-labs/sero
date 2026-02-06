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
import { useProjectStore, type ProjectStatus } from '../stores/project-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import { useAgentStore } from '../stores/agent-store';
import { ProjectTab } from './ProjectTab';
import { SortableTab } from './SortableTab';
import { CommandBar } from './CommandBar';
import './Shell.css';

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

  const { initWorkspace, cleanupWorkspace, addSkillsPanel, addSettingsPanel } = useWorkspaceStore();
  const { initProject: initAgentState, clearMessages } = useAgentStore();
  const projects = getProjectList();

  const [showCommandBar, setShowCommandBar] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [hasRestored, setHasRestored] = useState(false);

  // Restore persisted projects on first mount
  useEffect(() => {
    if (hasRestored) return;
    setHasRestored(true);

    (async () => {
      try {
        const persisted = await window.sero.persistence.loadProjects();
        if (!persisted || persisted.length === 0) return;

        for (const p of persisted) {
          addProject({
            id: p.id,
            name: p.name,
            image: p.image,
            cpus: p.cpus,
            memoryMB: p.memoryMB,
            ports: p.ports,
            createdAt: p.createdAt,
            status: 'creating', // Will update after reconnect
          });
          initWorkspace(p.id);
          initAgentState(p.id);

          // Restore container — create() is idempotent (returns existing if running)
          try {
            const containerState = await window.sero.container.create({
              id: p.id,
              name: p.name,
              image: p.image,
              cpus: p.cpus,
              memoryMB: p.memoryMB,
              ports: p.ports,
            });
            await window.sero.agent.create(p.id);
            updateProject(p.id, { status: 'running', ipAddress: containerState?.ipAddress });
          } catch (err) {
            console.error(`Failed to restore project ${p.id}:`, err);
            updateProject(p.id, { status: 'error' });
          }
        }

        // Restore active project tab
        const savedActiveId = await window.sero.persistence.loadActiveProjectId();
        if (savedActiveId && persisted.some((p: any) => p.id === savedActiveId)) {
          setActiveProject(savedActiveId);
        } else if (persisted.length > 0) {
          setActiveProject(persisted[0].id);
        }
      } catch (err) {
        console.error('Failed to load persisted projects:', err);
      }
    })();
  }, [hasRestored]);

  // Persist active project whenever it changes
  useEffect(() => {
    if (hasRestored && activeProjectId) {
      window.sero.persistence.saveActiveProjectId(activeProjectId);
    }
  }, [activeProjectId, hasRestored]);

  const handleNewProject = useCallback(async () => {
    if (isCreating) return;
    setIsCreating(true);

    const id = `proj-${Date.now().toString(36)}`;
    const name = `Project ${projects.length + 1}`;
    // Random high port to avoid collisions with other projects/services
    const hostPort = 10000 + Math.floor(Math.random() * 50000);

    const project = {
      id,
      name,
      image: 'sero-node:latest',
      status: 'creating' as ProjectStatus,
      cpus: 2,
      memoryMB: 1024,
      ports: [{ host: hostPort, container: 3000 }],
      createdAt: Date.now(),
    };

    addProject(project);
    initWorkspace(id);
    initAgentState(id);

    try {
      // Spin up container
      const containerState = await window.sero.container.create({
        id,
        name,
        image: project.image,
        cpus: project.cpus,
        memoryMB: project.memoryMB,
        ports: project.ports,
      });

      // Create agent session
      await window.sero.agent.create(id);

      updateProject(id, {
        status: 'running',
        ipAddress: containerState?.ipAddress,
      });

      // Persist to disk
      window.sero.persistence.saveProject({
        id,
        name,
        image: project.image,
        cpus: project.cpus,
        memoryMB: project.memoryMB,
        ports: project.ports,
        createdAt: project.createdAt,
      });
    } catch (err) {
      console.error('Failed to create project:', err);
      updateProject(id, { status: 'error' });
    } finally {
      setIsCreating(false);
    }
  }, [projects.length, isCreating, addProject, initWorkspace, initAgentState, updateProject]);

  // Global keyboard shortcuts
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
      // ⌘1–9 to switch project tabs
      if (e.metaKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        const list = getProjectList();
        if (list[idx]) {
          setActiveProject(list[idx].id);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleNewProject, getProjectList, setActiveProject]);

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

  const statusColor = (status: ProjectStatus): string => {
    switch (status) {
      case 'running': return 'var(--status-success)';
      case 'creating':
      case 'stopping': return 'var(--status-warning)';
      case 'error': return 'var(--status-error)';
      default: return 'var(--text-muted)';
    }
  };

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
    [projectIds, reorderProjects]
  );

  return (
    <div className="shell">
      {/* Title bar / drag region */}
      <div className="shell-titlebar drag-region">
        <div className="shell-titlebar-spacer" /> {/* Traffic light space */}

        <div className="shell-tabs no-drag">
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

          <button
            className="shell-tab shell-tab-new"
            onClick={handleNewProject}
            disabled={isCreating}
          >
            {isCreating ? '⏳' : '+'}
          </button>
        </div>

        <div className="shell-titlebar-actions no-drag">
          <button
            className="shell-cmd-trigger"
            onClick={() => setShowCommandBar(true)}
          >
            ⌘K
          </button>
        </div>
      </div>

      {/* Workspace area — render ALL projects, show only active (preserves state on tab switch) */}
      <div className="shell-workspace">
        {projects.length === 0 ? (
          <div className="shell-empty">
            <div className="shell-empty-content">
              <h1>Sero</h1>
              <p>Zero context switch, zero sprawl.</p>
              <button className="shell-create-btn" onClick={handleNewProject} disabled={isCreating}>
                {isCreating ? 'Spinning up container...' : 'Create Project'}
              </button>
            </div>
          </div>
        ) : (
          projects.map((project) => (
            <div
              key={project.id}
              className="shell-workspace-project"
              style={{ display: activeProjectId === project.id ? 'flex' : 'none' }}
            >
              <ProjectTab projectId={project.id} />
            </div>
          ))
        )}
      </div>

      {/* Command bar overlay */}
      {showCommandBar && (
        <CommandBar
          onClose={() => setShowCommandBar(false)}
          onNewProject={handleNewProject}
          onOpenSkills={() => {
            if (activeProjectId) addSkillsPanel(activeProjectId);
          }}
          onOpenSettings={() => {
            if (activeProjectId) addSettingsPanel(activeProjectId);
          }}
        />
      )}
    </div>
  );
}
