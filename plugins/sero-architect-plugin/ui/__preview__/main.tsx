/**
 * Component preview harness: a dev page, never part of the built plugin.
 *
 * Renders the projects list and the project page in every lifecycle state
 * against typed fixtures, so the production surface can be screenshotted next
 * to the signed-off prototype at the same width. No host bridge, no module
 * federation, no runtime. Run it with `pnpm --filter @sero-ai/plugin-architect preview`.
 */

import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AppContext } from '@sero-ai/app-runtime';
import { PluginStyleScope } from '@sero-ai/ui';
// The host supplies the design tokens in the real app. The harness has no
// host, so it injects the host stylesheet raw: routed through Vite it would
// meet the plugin CSS scope, which refuses document-level selectors.
import hostTokens from '@sero-ai/ui/styles/globals.css?raw';
import '../styles.css';
import './preview.css';

const tokens = document.createElement('style');
tokens.textContent = hostTokens;
document.head.prepend(tokens);
document.documentElement.classList.add('dark');
import { IntakeDialog } from '../components/IntakeDialog';
import { ProjectsList } from '../components/ProjectsList';
import { TopBar } from '../components/TopBar';
import { ModelSettings } from '../components/ModelSettings';
import { HistoryView } from '../components/HistoryView';
import { ProjectPage } from '../ProjectPage';
import { InspectorPreview } from './InspectorPreview';
import type { ArchitectActions, ActionOutcome } from '../lib/actions';
import type { Disclosures } from '../lib/page-helpers';
import type { ProjectRecord } from '../../shared/record';
import { FIXTURES as CHARTER_FIXTURES, INTAKE_WORKSPACES, INTAKE_WORKSPACES_WITH_PROJECT, listRows } from './fixture';
import { DELIVERY_FIXTURES, deliveryFeedback } from './delivery-fixture';
import { WorkPage } from '../WorkPage';
import { WORK_TABS, type WorkTab } from '../lib/navigation';
import { toIndexEntry } from '../../shared/record';
import { feedbackByProject, observedActivity } from '../../shared/feedback';
import { sessionStartedAt } from '@sero-ai/common';

const FIXTURES: Record<string, ProjectRecord> = { ...CHARTER_FIXTURES, ...DELIVERY_FIXTURES };

const ok = async (): Promise<ActionOutcome> => ({ ok: true, text: 'ok' });

/**
 * The global tiers the models page reads on arrival. `?runtime=off` refuses
 * that read, which is the case the drawing's second table shows: the
 * selections exist on the host and the page cannot reach them.
 */
const TIERS = {
  LOW: { provider: 'deepseek', modelId: 'v4.1-flash', thinkingLevel: 'low' },
  MED: { provider: 'deepseek', modelId: 'v4.1-flash', thinkingLevel: 'high' },
  HIGH: { provider: 'openai-codex', modelId: 'gpt-5.6-sol', thinkingLevel: 'medium' },
} as const;

const actions: ArchitectActions = {
  // The harness has no runtime, so the state in the address names what the work reports.
  feedback: async () => deliveryFeedback(new URLSearchParams(window.location.search).get('state') ?? ''),
  create: ok, history: async () => ({ ok: true, text: 'ok', entries: [] }), trace: async () => ({ ok: true, text: 'ok', page: null }), lifetime: async () => ({ ok: true, text: 'ok', lifetime: null }), pause: ok, resume: ok, retry: ok, stop: ok, remove: ok, raiseCap: ok, setExecutionMode: ok, setAutonomy: ok,
  approveCharter: ok, approveMilestone: ok, answer: ok, directive: ok, requestChange: ok, enableOpenSpec: ok,
  setModelDefault: ok, clearModelDefault: ok,
  refreshModelTiers: async () => (new URLSearchParams(window.location.search).get('runtime') === 'off'
    ? { ok: false, text: 'The Architect runtime is not running.' }
    : { ok: true, text: 'ok', tiers: TIERS }),
};

// The intake dialog lists models and workspaces through the host bridge; the harness answers with fixed catalogues.
(window as Window & { sero?: unknown }).sero = { appState: {}, appAgent: {}, workspace: { list: async () => INTAKE_WORKSPACES, pickFolder: async () => null }, models: { list: async () => [
  { provider: 'openai-codex', displayName: 'OpenAI Codex', logo: '', models: [
    { provider: 'openai-codex', modelId: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', reasoning: true, availableThinkingLevels: ['low', 'medium', 'high'] },
    { provider: 'openai-codex', modelId: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', reasoning: true, availableThinkingLevels: ['low', 'medium', 'high'] },
    { provider: 'openai-codex', modelId: 'gpt-6-astra', name: 'GPT-6 Astra', reasoning: true, availableThinkingLevels: ['low', 'medium', 'high'] },
  ] },
  { provider: 'anthropic', displayName: 'Anthropic', logo: '', models: [
    { provider: 'anthropic', modelId: 'claude-sonnet-5', name: 'Claude Sonnet 5', reasoning: true, availableThinkingLevels: ['low', 'medium', 'high'] },
    { provider: 'anthropic', modelId: 'claude-opus-5', name: 'Claude Opus 5', reasoning: true, availableThinkingLevels: ['low', 'medium', 'high'] },
  ] },
  { provider: 'deepseek', displayName: 'DeepSeek', logo: '', models: [
    { provider: 'deepseek', modelId: 'v4.1-flash', name: 'DeepSeek V4.1 Flash', reasoning: true, availableThinkingLevels: ['low', 'medium', 'high'] },
    { provider: 'deepseek', modelId: 'v4-pro', name: 'DeepSeek V4 Pro', reasoning: true, availableThinkingLevels: ['low', 'medium', 'high'] },
  ] },
  { provider: 'xai', displayName: 'xAI', logo: '', models: [
    { provider: 'xai', modelId: 'grok-4.5', name: 'Grok 4.5', reasoning: true, availableThinkingLevels: ['low', 'medium', 'high'] },
  ] },
] } };

const params = new URLSearchParams(window.location.search);
const state = params.get('state') ?? 'list';
const width = Number(params.get('width') ?? 1240);
// `?runtime=off` draws the list as it reads when the Architect runtime is not
// running in this session: the notice at the top and last-known rows.
const runtimeRunning = params.get('runtime') !== 'off';

/**
 * The folds the History view reads. The real app keeps them in the host layout
 * service; the harness has no host, so it keeps them here and the notes still
 * open.
 */
function usePreviewDisclosures(): Disclosures {
  const [openedNotes, setOpenedNotes] = useState<ReadonlySet<string>>(new Set());
  return {
    folds: {
      opened: openedNotes,
      toggle: (key: string) => setOpenedNotes((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key); else next.add(key);
        return next;
      }),
    },
  };
}

function IntakePreview({ mode = 'new' }: { mode?: 'new' | 'existing' }) {
  return <IntakeDialog open onClose={() => undefined} onCreate={async () => ({ ok: true, text: 'ok' })} defaultFolder="~/Projects/" takenWorkspaceIds={INTAKE_WORKSPACES_WITH_PROJECT} initialMode={mode} />;
}

function HistoryPreview({ record, disclosures }: { record: ProjectRecord; disclosures: Disclosures }) {
  return (
    <HistoryView
      record={record}
      onBack={() => undefined}
      onOpenDispatch={() => undefined}
      onOpenEvidence={() => undefined}
      folds={disclosures.folds}
    />
  );
}

function ModelSettingsPreview({ runtimeRunning }: { runtimeRunning: boolean }) {
  return (
    <ModelSettings
      runtimeRunning={runtimeRunning}
      record={{
        ...FIXTURES.build!,
        name: 'FroggerNeon',
        modelConfigRevision: 5,
        modelOverrides: runtimeRunning ? TIERS : undefined,
        session: {
          ...FIXTURES.build!.session,
          model: runtimeRunning ? 'deepseek/v4.1-flash' : 'openai-codex/gpt-5.6-luna',
          thinking: 'high',
          modelSource: 'owner-environment-pin',
          modelOutranks: 'MED',
        },
      }}
      actions={actions}
      onBack={() => undefined}
    />
  );
}

/** `?view=work&tab=plan` opens the Work view. The tabs and the way back work as in the app. */
function ProjectPreview({ record, runtimeRunning }: {
  record: ProjectRecord;
  runtimeRunning: boolean;
}) {
  const [tab, setTab] = useState<WorkTab | null>(() => params.get('view') === 'work' ? WORK_TABS.find((item) => item === params.get('tab')) ?? 'plan' : null);
  if (tab) return <WorkPage record={record} actions={actions} runtimeRunning={runtimeRunning} tab={tab} onTab={setTab} onOpenEvidence={() => setTab("evidence")} onBack={() => setTab(null)} onProject={() => setTab(null)} onOpenHistory={() => undefined} />;
  return (
    <ProjectPage runtimeRunning={runtimeRunning} record={record} actions={actions} onOpenWork={setTab} onBack={() => undefined} onOpenModels={() => undefined} onOpenInspector={() => undefined} onOpenHistory={() => undefined} confirm={() => true} />
  );
}

/** The charter-flow rows, led by the agreement project in the state `?delivery=` names. */
function previewRows(runtimeRunning: boolean) {
  const key = `delivery-${params.get('delivery') ?? 'working'}`;
  const record = DELIVERY_FIXTURES[key];
  if (!record) return listRows(runtimeRunning);
  const reply = deliveryFeedback(key);
  const entry = toIndexEntry(record, { sessionStartedAt: sessionStartedAt(), runtimeRunning });
  const work = feedbackByProject(reply.snapshots, reply.epoch).get(record.id);
  return [{ ...entry, activity: observedActivity(entry.activity, work) }, ...listRows(runtimeRunning)];
}

function ProjectsOverview({ state, runtimeRunning }: { state: string; runtimeRunning: boolean }) {
  return (
    <>
      <TopBar record={null} controls={null} onBack={() => undefined} onNewProject={() => undefined} needsYou={{ count: previewRows(runtimeRunning).filter((row) => row.activity.action).length, on: false, toggle: () => undefined }} />
      <ProjectsList needsOnly={false} projects={state === 'empty' ? [] : previewRows(runtimeRunning)} runtime={{ running: runtimeRunning, startedAt: new Date().toISOString() }} onOpen={() => undefined} onNewProject={() => undefined} />
    </>
  );
}

function PreviewStage({ state, width, runtimeRunning, disclosures }: {
  state: string;
  width: number;
  runtimeRunning: boolean;
  disclosures: Disclosures;
}) {
  const record = FIXTURES[state];
  return (
    <div className="ar-app">
      {state === 'new-project' && <IntakePreview />}
      {state === 'existing-workspace' && <IntakePreview mode="existing" />}
      {state === 'inspector' ? (
        <InspectorPreview actions={actions} />
      ) : state === 'history' && record ? (
        <HistoryPreview record={record} disclosures={disclosures} />
      ) : state === 'models' ? (
        <ModelSettingsPreview runtimeRunning={runtimeRunning} />
      ) : record ? (
        <ProjectPreview record={record} runtimeRunning={runtimeRunning} />
      ) : (
        <ProjectsOverview state={state} runtimeRunning={runtimeRunning} />
      )}
    </div>
  );
}

function Preview() {
  const disclosures = usePreviewDisclosures();
  // The host wraps a plugin surface in `PluginStyleScope`, which gives portaled
  // menus a container inside the plugin's `@scope`. Without it the harness's
  // Radix popovers portal to `document.body` and lose every plugin style.
  return (
    <AppContext value={{ appId: 'architect', workspaceId: 'global', workspacePath: '', stateFilePath: '' }}>
    <PluginStyleScope pluginId="architect" surfaceId="preview">
      <div data-sero-plugin="architect">
        <div className="dark" style={{ padding: 24 }}>
          <div className="preview-frame" style={{ width }}>
            <PreviewStage state={state} width={width} runtimeRunning={runtimeRunning} disclosures={disclosures} />
          </div>
        </div>
      </div>
    </PluginStyleScope>
    </AppContext>
  );
}

const container = document.getElementById('root');
if (container) createRoot(container).render(<Preview />);
