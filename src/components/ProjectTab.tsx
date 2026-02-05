import React, { useCallback, useState } from 'react';
import { useProjectStore } from '../stores/project-store';
import { TiledWorkspace } from './TiledWorkspace';
import './ProjectTab.css';

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

  if (!project || project.status === 'creating') {
    return (
      <div className="project-tab">
        <div className="project-loading">
          <div className="project-loading-spinner" />
          <p className="project-loading-title">Spinning up container...</p>
          <p className="project-loading-detail">
            Booting {project?.image ?? 'Linux VM'} • {project?.cpus ?? 2} CPUs • {project?.memoryMB ?? 1024}MB
          </p>
        </div>
      </div>
    );
  }

  if (project.status === 'error') {
    return (
      <div className="project-tab">
        <div className="project-loading">
          <p className="project-loading-title" style={{ color: 'var(--status-error)' }}>
            Container failed to start
          </p>
          <p className="project-loading-detail">
            The container could not be created or reconnected.
          </p>
          <button
            className="project-retry-btn"
            onClick={handleRetry}
            disabled={retrying}
          >
            {retrying ? 'Retrying...' : 'Retry'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="project-tab">
      <TiledWorkspace projectId={projectId} />
      <div className="project-statusbar">
        <span className="project-statusbar-item">
          <span className="project-statusbar-dot" />
          {project.image}
        </span>
        <span className="project-statusbar-item">
          {project.cpus} CPU • {project.memoryMB}MB
        </span>
        {project.ipAddress && (
          <span className="project-statusbar-item project-statusbar-ip">
            🌐 {project.ipAddress}
          </span>
        )}
        {project.ports.map((p) => (
          <span key={p.container} className="project-statusbar-item">
            :{p.container} → :{p.host}
          </span>
        ))}
      </div>
    </div>
  );
}
