import { describe, expect, it } from 'vitest';
import { resolveExplorerPanelId } from './explorer-panels';

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
