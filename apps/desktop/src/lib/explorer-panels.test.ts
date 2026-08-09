import { describe, expect, it } from 'vitest';
import { explorerPanelAppId, resolveExplorerPanelId } from './explorer-panels';

describe('resolveExplorerPanelId', () => {
  const contributions = [
    { key: 'git:explorer-view', appId: 'git' },
    { key: 'notes:first', appId: 'notes' },
    { key: 'notes:second', appId: 'notes' },
  ];

  it('keeps canonical and built-in panel ids', () => {
    expect(resolveExplorerPanelId('git:explorer-view', contributions)).toBe('git:explorer-view');
    expect(resolveExplorerPanelId('explorer', contributions)).toBe('explorer');
  });

  it('maps a legacy app id when the app has one Explorer view', () => {
    expect(resolveExplorerPanelId('git', contributions)).toBe('git:explorer-view');
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
    expect(explorerPanelAppId('git:explorer-view')).toBe('git');
  });
});
