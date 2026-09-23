/**
 * Component preview harness — a dev page, never part of the built plugin.
 *
 * The plan map draws fixed-height cards at computed positions, with SVG edges
 * between them. A card that clips its outcome, or an edge that crosses a node,
 * passes every unit test. This page renders the real components against a typed
 * fixture so those faults are visible, and screenshot-able.
 *
 * Run it with `pnpm --filter @sero-ai/plugin-orchestrator preview`.
 */

import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { PluginStyleScope } from '@sero-ai/ui';
// The host supplies the design tokens in the real app. The harness has no host,
// so it injects the host stylesheet raw: routed through Vite it would meet the
// plugin CSS scope, which refuses document-level selectors.
import hostTokens from '@sero-ai/ui/styles/globals.css?raw';
import '../styles.css';
import './preview.css';
import { PREVIEWS } from './previews';

const tokens = document.createElement('style');
tokens.textContent = hostTokens;
document.head.prepend(tokens);

function Harness() {
  const [dark, setDark] = useState(true);
  const only = new URLSearchParams(window.location.search).get('preview');
  const previews = only ? PREVIEWS.filter((preview) => preview.id === only) : PREVIEWS;

  return (
    // The plugin's CSS is wrapped in `@scope ([data-sero-plugin]) to (…)`, where
    // a bare selector such as `.dark` matches descendants of the scope root and
    // never the root itself. The theme class goes one level in.
    <div data-sero-plugin="orchestrator">
      <div className={`${dark ? 'dark' : ''} min-h-screen bg-background p-8 text-foreground`}>
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold">Orchestrator component previews</h1>
            <p className="text-xs text-foreground/70">
              The host supplies the theme in the real app. Add <code>?preview=&lt;id&gt;</code> to show one.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md border border-border px-2.5 py-1 text-xs"
            onClick={() => setDark((current) => !current)}
          >
            {dark ? 'Light theme' : 'Dark theme'}
          </button>
        </header>

        <div className="flex flex-col gap-10">
          {previews.map((preview) => (
            <section key={preview.id} id={preview.id} className="flex flex-col gap-2">
              <h2 className="text-base font-medium">{preview.title}</h2>
              <p className="text-xs text-foreground/70">{preview.note}</p>
              {/* The app root carries @container/panel; without it here every
                  container query in a preview reads as the narrow layout. */}
              <div className="@container/panel" style={{ width: preview.width }}>{preview.render()}</div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

const container = document.getElementById('root');
if (container) {
  // The host wraps a plugin surface in `PluginStyleScope`, which gives portaled
  // popups a container inside the plugin's `@scope`. Without it the harness's
  // combobox popups portal to `document.body` and lose every plugin style.
  createRoot(container).render(
    <PluginStyleScope pluginId="orchestrator" surfaceId="preview">
      <Harness />
    </PluginStyleScope>,
  );
}
