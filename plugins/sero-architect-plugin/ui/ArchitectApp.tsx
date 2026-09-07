import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppState } from '@sero-ai/app-runtime';

import type { ArchitectIndex } from '../shared/types';
import { DEFAULT_INDEX, normalizeIndex } from '../shared/types';
import { IntakeDialog } from './components/IntakeDialog';
import { ProjectsList } from './components/ProjectsList';
import { TopBar } from './components/TopBar';
import { Quiet } from './components/Pill';
import { useArchitectActions } from './lib/actions';
import { useArchitectView } from './lib/navigation';
import { useProjectRecord } from './lib/use-project-record';
import { useDisclosures } from './lib/page-helpers';
import { ProjectPage } from './ProjectPage';
import './styles.css';

/** Below this width the side column folds under the main column, as the prototype's 960 frame does. */
const NARROW_BELOW = 1100;

function useNarrow(): [boolean, (node: HTMLDivElement | null) => void] {
  const [narrow, setNarrow] = useState(false);
  const observer = useRef<ResizeObserver | null>(null);
  const attach = useCallback((node: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!node || typeof ResizeObserver === 'undefined') return;
    observer.current = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setNarrow(width > 0 && width < NARROW_BELOW);
    });
    observer.current.observe(node);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [narrow, attach];
}

export function ArchitectApp() {
  // The watched index is the app's state file. The page watches one record beside it.
  const [stored] = useAppState<ArchitectIndex>(DEFAULT_INDEX);
  const index = normalizeIndex(stored);
  const [view, navigate] = useArchitectView();
  const actions = useArchitectActions();
  const projectId = view.mode === 'project' ? view.projectId : null;
  const { record, ready } = useProjectRecord(projectId);
  const [narrow, attach] = useNarrow();
  const disclosures = useDisclosures();

  const openProject = useCallback((id: string) => navigate({ mode: 'project', projectId: id }), [navigate]);
  const openIntake = useCallback(() => navigate({ mode: 'list', intake: true }), [navigate]);
  const closeIntake = useCallback(() => navigate({ mode: 'list' }), [navigate]);
  const back = useCallback(() => navigate({ mode: 'list' }), [navigate]);
  const confirm = useCallback((message: string) => window.confirm(message), []);

  const create = useCallback(async (idea: string, folder: string) => {
    const outcome = await actions.create(idea, folder);
    if (outcome.ok && outcome.projectId) navigate({ mode: 'project', projectId: outcome.projectId });
    return outcome;
  }, [actions, navigate]);

  // A deleted project's page falls back to the list once the index no longer lists it.
  const listed = projectId ? index.projects.some((entry) => entry.id === projectId) : false;
  const gone = projectId !== null && ready && record === null && !listed;

  return (
    <div className="ar-app" ref={attach}>
      {projectId && record ? (
        <ProjectPage record={record} actions={actions} narrow={narrow} disclosures={disclosures} onBack={back} confirm={confirm} />
      ) : projectId && !gone ? (
        <>
          <TopBar record={null} controls={null} onBack={back} onNewProject={openIntake} />
          <div className="ar-body"><Quiet>Opening the project…</Quiet></div>
        </>
      ) : (
        <>
          <TopBar record={null} controls={null} onBack={back} onNewProject={openIntake} />
          <div className="ar-scroll">
            <ProjectsList projects={index.projects} onOpen={openProject} onNewProject={openIntake} />
          </div>
          <IntakeDialog open={view.mode === 'list' && view.intake === true} onClose={closeIntake} onCreate={create} defaultFolder="~/Projects/" />
        </>
      )}
    </div>
  );
}

export default ArchitectApp;
