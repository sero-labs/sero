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
import { ProjectPage } from '../ProjectPage';
import type { ArchitectActions, ActionOutcome } from '../lib/actions';
import { FIXTURES, listRows } from './fixture';

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
  create: ok, history: async () => ({ ok: true, text: 'ok', entries: [] }), trace: async () => ({ ok: true, text: 'ok', page: null }), pause: ok, resume: ok, retry: ok, stop: ok, remove: ok, raiseCap: ok, setExecutionMode: ok, setAutonomy: ok,
  approveCharter: ok, approveMilestone: ok, answer: ok, directive: ok,
  setModelDefault: ok, clearModelDefault: ok,
  refreshModelTiers: async () => (new URLSearchParams(window.location.search).get('runtime') === 'off'
    ? { ok: false, text: 'The Architect runtime is not running.' }
    : { ok: true, text: 'ok', tiers: TIERS }),
};

// The intake dialog lists models through the host bridge; the harness answers with a fixed catalogue.
(window as Window & { sero?: unknown }).sero = { appState: {}, appAgent: {}, models: { list: async () => [
  { provider: 'openai-codex', displayName: 'OpenAI', logo: '', models: [
    { provider: 'openai-codex', modelId: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', reasoning: true, availableThinkingLevels: ['low', 'medium', 'high'] },
    { provider: 'openai-codex', modelId: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', reasoning: true, availableThinkingLevels: ['low', 'medium', 'high'] },
  ] },
  { provider: 'deepseek', displayName: 'DeepSeek', logo: '', models: [
    { provider: 'deepseek', modelId: 'v4.1-flash', name: 'DeepSeek V4.1 Flash', reasoning: true, availableThinkingLevels: ['low', 'medium', 'high'] },
  ] },
] } };

const params = new URLSearchParams(window.location.search);
const state = params.get('state') ?? 'list';
const width = Number(params.get('width') ?? 1240);
// `?runtime=off` draws the list as it reads when the Architect runtime is not
// running in this session: the notice at the top and last-known rows.
const runtimeRunning = params.get('runtime') !== 'off';

function Preview() {
  const record = FIXTURES[state];
  const [historyOpen, setHistoryOpen] = useState(params.get('history') === 'open');
  const [olderOpen, setOlderOpen] = useState(false);
  const disclosures = { historyOpen, olderOpen, setHistoryOpen, setOlderOpen };
  return (
    <div data-sero-plugin="architect">
      <div className="dark" style={{ padding: 24 }}>
        <div className="preview-frame" style={{ width }}>
          <div className="ar-app">
            {state === 'new-project' && <IntakeDialog open onClose={() => undefined} onCreate={async () => ({ ok: true, text: 'ok' })} defaultFolder="~/Projects/" />}
            {state === 'models' ? (
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
            ) : record ? (
              <ProjectPage runtimeRunning={runtimeRunning} record={record} actions={actions} narrow={width < 1100} disclosures={disclosures} onBack={() => undefined} onOpenModels={() => undefined} onOpenInspector={() => undefined} confirm={() => true} />
            ) : (
              <>
                <TopBar record={null} controls={null} onBack={() => undefined} onNewProject={() => undefined} needsYou={{ count: listRows(runtimeRunning).filter((row) => row.activity.action).length, on: false, toggle: () => undefined }} />
                <ProjectsList needsOnly={false} projects={state === 'empty' ? [] : listRows(runtimeRunning)} runtime={{ running: runtimeRunning, startedAt: new Date().toISOString() }} onOpen={() => undefined} onNewProject={() => undefined} />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) createRoot(container).render(<Preview />);
