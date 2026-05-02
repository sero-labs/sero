import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PluginDevSessionIPC } from '../../hooks/host';
import { PluginDevSessionCard } from './PluginDevSessionCard';

function createSession(overrides: Partial<PluginDevSessionIPC> = {}): PluginDevSessionIPC {
  return {
    sessionId: 'dev_weather',
    appId: 'weather-pro',
    name: 'Weather Pro Dev',
    sourcePath: '/Users/example/Code/sero-weather-plugin',
    status: 'active',
    uiMode: 'dev-server',
    remoteEntryOverride: 'http://127.0.0.1:5193/mf-manifest.json',
    lastError: null,
    updatedAt: '2026-04-19T21:00:00.000Z',
    ...overrides,
  };
}

describe('PluginDevSessionCard', () => {
  it.each([
    ['dev-server', 'Live UI dev server', 'Using the managed local UI dev server for this session.'],
    ['built-fallback', 'Built UI fallback', 'Using built UI assets from the checkout because live UI was unavailable.'],
    ['backend-only', 'Backend only', 'This plugin exposes backend behavior only and does not declare a UI surface.'],
    ['unavailable', 'UI unavailable', 'The session is active where possible, but no UI surface is currently available.'],
  ] as const)('maps %s to the expected badge and helper copy', (uiMode, label, description) => {
    const html = renderToStaticMarkup(
      <PluginDevSessionCard
        session={createSession({
          uiMode,
          status: uiMode === 'unavailable' ? 'needs-attention' : 'active',
          remoteEntryOverride: uiMode === 'dev-server' ? 'http://127.0.0.1:5193/mf-manifest.json' : null,
        })}
        refreshing={false}
        stopping={false}
        onRefresh={() => {}}
        onStop={() => {}}
        onReveal={() => {}}
      />,
    );

    expect(html).toContain(label);
    expect(html).toContain(description);
  });

  it('shows status text, retry/remove actions, and the last error for broken sessions', () => {
    const html = renderToStaticMarkup(
      <PluginDevSessionCard
        session={createSession({
          status: 'broken',
          uiMode: 'unavailable',
          appId: null,
          remoteEntryOverride: null,
          lastError: 'Manifest parsing failed after refresh.',
        })}
        refreshing={false}
        stopping={false}
        onRefresh={() => {}}
        onStop={() => {}}
        onReveal={() => {}}
      />,
    );

    expect(html).toContain('Broken');
    expect(html).toContain('Saved for recovery, but not currently active.');
    expect(html).toContain('Retry');
    expect(html).toContain('Remove');
    expect(html).toContain('Awaiting a valid plugin manifest');
    expect(html).toContain('Last error');
    expect(html).toContain('Manifest parsing failed after refresh.');
  });
});
