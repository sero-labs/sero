// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const slotMock = vi.hoisted(() => ({
  contributions: [] as Array<{
    key: string;
    extensionPoint: 'ui.admin.model-settings';
    name: string;
    contributorAppId: string;
    contributorAppName: string;
  }>,
  mount: vi.fn((key: string): ReactNode => <div>Mounted {key}</div>),
}));

vi.mock('@sero-ai/app-runtime', () => ({
  useAppContributionSlot: () => ({
    status: 'available',
    contributions: slotMock.contributions,
    mount: slotMock.mount,
  }),
}));
vi.mock('./ModelPanel', () => ({ ModelPanel: () => <div>Sero tier editor</div> }));

import { ModelSettingsPanel } from './ModelSettingsPanel';

function provider(key: string, name: string) {
  return {
    key,
    extensionPoint: 'ui.admin.model-settings' as const,
    name,
    contributorAppId: key,
    contributorAppName: name,
  };
}

describe('ModelSettingsPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    slotMock.contributions = [];
    slotMock.mount.mockClear();
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('keeps the existing Sero editor when no app contributes settings', async () => {
    await act(async () => root.render(
      <ModelSettingsPanel selectedKey="sero-defaults" onSelect={() => undefined} />,
    ));

    expect(container.textContent).toBe('Sero tier editor');
    expect(container.querySelector('[role="tablist"]')).toBeNull();
  });

  it('sorts contributed sections and mounts only the selected entry', async () => {
    slotMock.contributions = [provider('zeta:settings', 'Zeta'), provider('alpha:settings', 'Alpha')];
    await act(async () => root.render(
      <ModelSettingsPanel selectedKey="alpha:settings" onSelect={() => undefined} />,
    ));

    expect([...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent)).toEqual([
      'Sero defaults',
      'Alpha',
      'Zeta',
    ]);
    expect(container.textContent).toContain('Mounted alpha:settings');
    expect(slotMock.mount).toHaveBeenCalledTimes(1);
  });

  it('returns to Sero defaults when the selected contribution disappears', async () => {
    const onSelect = vi.fn();
    slotMock.contributions = [provider('alpha:settings', 'Alpha')];
    await act(async () => root.render(
      <ModelSettingsPanel selectedKey="alpha:settings" onSelect={onSelect} />,
    ));
    slotMock.contributions = [];
    await act(async () => root.render(
      <ModelSettingsPanel selectedKey="alpha:settings" onSelect={onSelect} />,
    ));

    expect(onSelect).toHaveBeenCalledWith('sero-defaults');
    expect(container.textContent).toBe('Sero tier editor');
  });

  it('supports arrow-key selection with accessible tab names', async () => {
    const onSelect = vi.fn();
    slotMock.contributions = [provider('alpha:settings', 'Alpha')];
    await act(async () => root.render(
      <ModelSettingsPanel selectedKey="sero-defaults" onSelect={onSelect} />,
    ));
    const first = container.querySelector<HTMLButtonElement>('[role="tab"]');
    first?.focus();
    await act(async () => first?.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'ArrowRight',
      bubbles: true,
    })));

    expect(onSelect).toHaveBeenCalledWith('alpha:settings');
    expect(document.activeElement?.textContent).toBe('Alpha');
    expect(container.querySelector('[role="tablist"]')?.getAttribute('aria-label'))
      .toBe('Model settings sections');
  });
});
