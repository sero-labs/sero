import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  notify: vi.fn(),
}));

// Notifications go through the feed now, which shows the toast itself.
// Mocking the feed keeps the test off the real notification log on disk.
vi.mock('@electron/features/notifications/feed', () => ({
  notify: mocks.notify,
}));

describe('createSeroUIContext', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('provides notification bridging plus inert unsupported TUI helpers', async () => {
    const { createSeroUIContext } = await import('@electron/features/apps/extensions/ui-context');
    const ui = createSeroUIContext();

    ui.notify('Build finished', 'warning');

    expect(mocks.notify).toHaveBeenCalledWith({ message: 'Build finished', type: 'warning' });
    expect(await ui.select('Choose', ['a', 'b'])).toBeUndefined();
    expect(await ui.confirm('Confirm', 'Proceed?')).toBe(false);
    expect(await ui.input('Input', 'Placeholder')).toBeUndefined();
    expect(await ui.custom(async () => {
      throw new Error('Sero should not invoke unsupported custom UI factories');
    })).toBeUndefined();

    ui.setWorkingVisible(true);
    ui.setWorkingIndicator({ frames: ['●'] });
    ui.setHiddenThinkingLabel('Thinking hidden');
    ui.addAutocompleteProvider((current) => current);
    expect(ui.getEditorComponent()).toBeUndefined();

    const editorFactory = vi.fn();
    ui.setEditorComponent(editorFactory);
    expect(ui.getEditorComponent()).toBe(editorFactory);
    ui.setEditorComponent(undefined);
    expect(ui.getEditorComponent()).toBeUndefined();

    expect(ui.theme.getColorMode()).toBeTypeOf('string');
  });
});
