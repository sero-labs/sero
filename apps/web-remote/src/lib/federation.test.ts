import { describe, expect, it, beforeEach, vi } from 'vitest';

const registerRemotes = vi.fn();
const loadRemote = vi.fn(async (_id: string) => ({ default: () => null }));

vi.mock('@module-federation/enhanced/runtime', () => ({
  registerRemotes: (remotes: unknown, options: unknown) => registerRemotes(remotes, options),
  loadRemote: (id: string) => loadRemote(id),
}));

import { loadWidgetModule, resetFederation, widgetComponent } from './federation';

const source = {
  remoteName: 'sero_todo',
  component: 'Summary',
  remoteEntry: '/ext/todo/mf-manifest.json?t=first',
};

beforeEach(() => {
  resetFederation();
  registerRemotes.mockClear();
  loadRemote.mockClear();
});

describe('widgetComponent', () => {
  it('registers the remote once while the entry is unchanged', () => {
    widgetComponent(source);
    widgetComponent(source);

    expect(registerRemotes).toHaveBeenCalledTimes(1);
    expect(registerRemotes).toHaveBeenCalledWith(
      [{ name: 'sero_todo', entry: source.remoteEntry }],
      { force: true },
    );
  });

  it('registers again when the ticket changes', () => {
    widgetComponent(source);
    widgetComponent({ ...source, remoteEntry: '/ext/todo/mf-manifest.json?t=second' });

    expect(registerRemotes).toHaveBeenCalledTimes(2);
  });

  it('keeps one component across a ticket change, so the widget stays mounted', () => {
    const first = widgetComponent(source);
    const second = widgetComponent({
      ...source,
      remoteEntry: '/ext/todo/mf-manifest.json?t=second',
    });

    expect(second).toBe(first);
  });

  it('asks the runtime for the widget by its federated name', async () => {
    await loadWidgetModule(source);

    expect(loadRemote).toHaveBeenCalledWith('sero_todo/Summary');
  });

  it('fails loudly when the remote exports no component', async () => {
    loadRemote.mockResolvedValueOnce({} as { default: () => null });

    await expect(loadWidgetModule(source)).rejects.toThrow('exports no component');
  });
});
