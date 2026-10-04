import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { useAppState } from '@sero-ai/app-runtime';

import type { CreateProjectInput } from '../shared/create-project';
import type { ArchitectIndex } from '../shared/types';
import { DEFAULT_INDEX, normalizeIndex } from '../shared/types';
import { IntakeDialog } from './components/IntakeDialog';
import { Inspector } from './components/Inspector';
import { HistoryView } from './components/HistoryView';
import { ModelSettings } from './components/ModelSettings';
import { observedActivity } from '../shared/feedback';
import { useProjectsFeedback } from './lib/use-project-feedback';
import { ProjectsList } from './components/ProjectsList';
import { TopBar } from './components/TopBar';
import { Quiet } from './components/Pill';
import { useArchitectActions, type ArchitectActions } from './lib/actions';
import { useArchitectView, type ArchitectView, type WorkTab } from './lib/navigation';
import { useProjectRecord } from './lib/use-project-record';
import { openDispatch, useDisclosures, type Disclosures } from './lib/page-helpers';
import { ProjectPage } from './ProjectPage';
import { WorkPage } from './WorkPage';
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

function useCreateProject(actions: ArchitectActions, navigate: (view: ArchitectView) => void) {
  const [permissionProjectId, setPermissionProjectId] = useState<string | null>(null);
  // Why the first start did not happen. Without it the new project only reads "Not started".
  const [refusal, setRefusal] = useState<{ projectId: string; text: string } | null>(null);
  const create = useCallback(async (input: CreateProjectInput) => {
    const outcome = await actions.create(input);
    // One navigation closes the dialog and opens the new project: the dialog must not navigate too.
    if (outcome.ok) {
      // Remove the modal before the host presents its permission question.
      setPermissionProjectId(outcome.projectId ?? null);
      navigate(outcome.projectId ? { mode: 'project', projectId: outcome.projectId } : { mode: 'list' });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      try {
        if (outcome.projectId) {
          const started = await actions.resume(outcome.projectId);
          setRefusal(started.ok ? null : { projectId: outcome.projectId, text: started.text });
        }
      } finally {
        setPermissionProjectId(null);
      }
    }
    return outcome;
  }, [actions, navigate]);

  return { create, permissionProjectId, refusal };
}

export function ArchitectApp() {
  // The watched index is the app's state file. The page watches one record beside it.
  const [stored] = useAppState<ArchitectIndex>(DEFAULT_INDEX);
  const index = normalizeIndex(stored);
  const [view, navigate] = useArchitectView();
  const actions = useArchitectActions();
  // The model settings and inspector views belong to a project, so they load the same record.
  const projectId = view.mode === 'list' ? null : view.projectId;
  const { record, ready } = useProjectRecord(projectId);
  const [narrow, attach] = useNarrow();
  const disclosures = useDisclosures();
  // The filter lives here because its control is in the top bar and the rows it
  // hides are in the list.
  const [needsOnly, setNeedsOnly] = useState(false);
  // Rows read what their work reports now, without loading a project record.
  const work = useProjectsFeedback(index.projects, actions);
  const projects = index.projects.map((entry) => ({ ...entry, activity: observedActivity(entry.activity, work.get(entry.id)) }));
  const needsYouCount = index.projects.filter((entry) => entry.activity.action).length;
  // One Architect project per workspace, so a linked workspace cannot be chosen again.
  const takenWorkspaceIds = index.projects.map((entry) => entry.workspaceId).filter((id): id is string => id !== null);

  const openProject = useCallback((id: string) => navigate({ mode: 'project', projectId: id }), [navigate]);
  const openModels = useCallback((id: string) => navigate({ mode: 'models', projectId: id }), [navigate]);
  const openInspector = useCallback((id: string) => navigate({ mode: 'inspector', projectId: id }), [navigate]);
  const openHistory = useCallback((id: string) => navigate({ mode: 'history', projectId: id }), [navigate]);
  const openEvidence = useCallback((id: string, milestoneId: string) => navigate({ mode: 'work', projectId: id, tab: 'evidence', focusMilestoneId: milestoneId }), [navigate]);
  const openWork = useCallback((id: string, tab: WorkTab) => navigate({ mode: 'work', projectId: id, tab }), [navigate]);
  const openIntake = useCallback(() => navigate({ mode: 'list', intake: true }), [navigate]);
  const closeIntake = useCallback(() => navigate({ mode: 'list' }), [navigate]);
  const back = useCallback(() => navigate({ mode: 'list' }), [navigate]);
  const confirm = useCallback((message: string) => window.confirm(message), []);

  const { create, permissionProjectId, refusal } = useCreateProject(actions, navigate);

  // A deleted project's page falls back to the list once the index no longer lists it.
  const listed = index.projects.some((entry) => entry.id === projectId);
  const gone = projectId !== null && ready && record === null && !listed;

  return (
    <div className="ar-app" ref={attach}>
      {projectId && record ? (
        <ProjectView view={view} onOpenWork={(tab) => openWork(record.id, tab)} onProject={() => openProject(record.id)} onOpenEvidence={(milestoneId) => openEvidence(record.id, milestoneId)} record={record} runtimeRunning={index.runtime?.running !== false} actions={actions} permissionPending={permissionProjectId === projectId} startRefusal={refusal?.projectId === projectId ? refusal.text : null} disclosures={disclosures} onBack={back} onOpenModels={() => openModels(projectId)} onOpenInspector={() => openInspector(projectId)} onOpenHistory={() => openHistory(projectId)} confirm={confirm} />
      ) : projectId && !gone ? (
        <>
          <TopBar record={null} controls={null} onBack={back} onNewProject={openIntake} />
          <div className="ar-body"><Quiet>Opening the project…</Quiet></div>
        </>
      ) : (
        <>
          <TopBar record={null} controls={null} onBack={back} onNewProject={openIntake} needsYou={{ count: needsYouCount, on: needsOnly, toggle: () => setNeedsOnly((was) => !was) }} />
          <div className="ar-scroll">
            <ProjectsList projects={projects} runtime={index.runtime} needsOnly={needsOnly} onOpen={openProject} onNewProject={openIntake} />
          </div>
          <IntakeDialog open={view.mode === 'list' && view.intake === true} onClose={closeIntake} onCreate={create} defaultFolder="~/Projects/" takenWorkspaceIds={takenWorkspaceIds} />
        </>
      )}
    </div>
  );
}

function ProjectView({ view, onProject, onOpenEvidence, disclosures, ...props }: ComponentProps<typeof ProjectPage> & {
  view: ArchitectView;
  disclosures: Disclosures;
  onProject(): void;
  onOpenEvidence(milestoneId: string): void;
}) {
  if (view.mode === 'models') return <ModelSettings record={props.record} actions={props.actions} runtimeRunning={props.runtimeRunning} onBack={onProject} />;
  if (view.mode === 'inspector') return <Inspector record={props.record} actions={props.actions} onBack={onProject} />;
  if (view.mode === 'history') return <HistoryView record={props.record} onBack={onProject} onOpenDispatch={openDispatch} onOpenEvidence={onOpenEvidence} folds={disclosures.folds} />;
  if (view.mode === 'work') return <WorkPage record={props.record} actions={props.actions} runtimeRunning={props.runtimeRunning} tab={view.tab} focusMilestoneId={view.focusMilestoneId} onTab={props.onOpenWork} onBack={props.onBack} onProject={onProject} onOpenHistory={props.onOpenHistory} />;
  return <ProjectPage {...props} />;
}

export default ArchitectApp;
