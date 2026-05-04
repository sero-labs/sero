import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  showNotification: vi.fn(),
}));

vi.mock('@electron/platform/desktop/notifications', () => ({
  showNotification: mocks.showNotification,
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

    expect(mocks.showNotification).toHaveBeenCalledWith('Build finished', 'warning');
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
