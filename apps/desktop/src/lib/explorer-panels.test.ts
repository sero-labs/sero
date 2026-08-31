import { describe, expect, it } from 'vitest';
import { explorerPanelAppId, resolveExplorerPanelId } from './explorer-panels';

describe('resolveExplorerPanelId', () => {
  const contributions = [
    { key: 'git:ui.explorer.view:explorer-view', appId: 'git', contribution: { id: 'explorer-view' } },
    { key: 'notes:ui.explorer.view:first', appId: 'notes', contribution: { id: 'first' } },
    { key: 'notes:ui.explorer.view:second', appId: 'notes', contribution: { id: 'second' } },
  ];

  it('keeps canonical and built-in panel ids', () => {
    expect(resolveExplorerPanelId('git:ui.explorer.view:explorer-view', contributions)).toBe('git:ui.explorer.view:explorer-view');
    expect(resolveExplorerPanelId('explorer', contributions)).toBe('explorer');
  });

  it('maps a legacy app id when the app has one Explorer view', () => {
    expect(resolveExplorerPanelId('git', contributions)).toBe('git:ui.explorer.view:explorer-view');
  });

  it('migrates the previous app and contribution key', () => {
    expect(resolveExplorerPanelId('git:explorer-view', contributions)).toBe('git:ui.explorer.view:explorer-view');
  });

  it('keeps an ambiguous legacy app id unchanged', () => {
    expect(resolveExplorerPanelId('notes', contributions)).toBe('notes');
  });
});

describe('explorerPanelAppId', () => {
  it('keeps a legacy app id unchanged', () => {
    expect(explorerPanelAppId('git')).toBe('git');
  });

  it('extracts the app id from a contributed panel key', () => {
    expect(explorerPanelAppId('git:ui.explorer.view:explorer-view')).toBe('git');
  });
});
