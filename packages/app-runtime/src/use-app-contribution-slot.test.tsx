// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, type AppContextValue } from './context';
import {
  useAppContributionSlot,
  type UseAppContributionSlotResult,
} from './use-app-contribution-slot';

function Probe() {
  const slot: UseAppContributionSlotResult = useAppContributionSlot('ui.admin.model-settings');
  const firstKey = slot.contributions[0]?.key ?? 'missing';
  return (
    <div data-status={slot.status} data-contributions={slot.contributions.map((entry) => entry.key).join(',')}>
      {slot.mount(firstKey, {
        loading: null,
        unavailable: <span>Unavailable slot</span>,
      })}
    </div>
  );
}

describe('useAppContributionSlot', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('reports an unavailable empty slot outside a host context', async () => {
    await act(async () => root.render(<Probe />));

    expect(container.firstElementChild?.getAttribute('data-status')).toBe('unavailable');
    expect(container.firstElementChild?.getAttribute('data-contributions')).toBe('');
    expect(container.textContent).toBe('Unavailable slot');
  });

  it('lists only the requested point and delegates mounting to the host', async () => {
    const context: AppContextValue = {
      appId: 'admin',
      workspaceId: 'global',
      workspacePath: '',
      stateFilePath: '/tmp/admin.json',
      contributionSlots: {
        components: [
          {
            key: 'provider:settings',
            extensionPoint: 'ui.admin.model-settings',
            name: 'Provider',
            contributorAppId: 'provider',
            contributorAppName: 'Provider',
          },
          {
            key: 'provider:search',
            extensionPoint: 'ui.global-search.panel',
            name: 'Search',
            contributorAppId: 'provider',
            contributorAppName: 'Provider',
          },
        ],
        mount: (key): ReactNode => <span>{key}</span>,
      },
    };
    await act(async () => root.render(
      <AppProvider value={context}>
        <Probe />
      </AppProvider>,
    ));

    expect(container.firstElementChild?.getAttribute('data-status')).toBe('available');
    expect(container.firstElementChild?.getAttribute('data-contributions')).toBe('provider:settings');
    expect(container.textContent).toBe('provider:settings');
  });
});
