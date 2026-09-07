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
import { ProjectsList } from '../components/ProjectsList';
import { TopBar } from '../components/TopBar';
import { ProjectPage } from '../ProjectPage';
import type { ArchitectActions, ActionOutcome } from '../lib/actions';
import { FIXTURES, LIST_ROWS } from './fixture';

const ok = async (): Promise<ActionOutcome> => ({ ok: true, text: 'ok' });
const actions: ArchitectActions = {
  create: ok, pause: ok, resume: ok, stop: ok, remove: ok, raiseCap: ok, setAutonomy: ok,
  approveCharter: ok, approveMilestone: ok, answer: ok, directive: ok,
};

const params = new URLSearchParams(window.location.search);
const state = params.get('state') ?? 'list';
const width = Number(params.get('width') ?? 1240);

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
            {record ? (
              <ProjectPage record={record} actions={actions} narrow={width < 1100} disclosures={disclosures} onBack={() => undefined} confirm={() => true} />
            ) : (
              <>
                <TopBar record={null} controls={null} onBack={() => undefined} onNewProject={() => undefined} />
                <ProjectsList projects={state === 'empty' ? [] : LIST_ROWS} onOpen={() => undefined} onNewProject={() => undefined} />
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
