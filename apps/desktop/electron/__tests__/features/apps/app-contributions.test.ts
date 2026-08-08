import { describe, expect, it, vi } from 'vitest';
import {
  parseAppContributions,
  warnContributionDiagnostics,
} from '@electron/features/apps/discovery/contributions';

describe('app contribution parsing', () => {
  it('parses multiple component and control contributions', () => {
    const parsed = parseAppContributions({
      contributes: {
        components: [
          {
            id: 'search-one',
            extensionPoint: 'ui.global-search.panel',
            component: 'SearchOne',
          },
          {
            id: 'search-two',
            extensionPoint: 'ui.global-search.panel',
            component: 'SearchTwo',
          },
        ],
        controls: [{
          id: 'indexing',
          extensionPoint: 'workspace.create.option',
          control: { type: 'switch', label: 'Enable indexing', defaultValue: true },
          action: { type: 'tool', tool: 'enable_index', params: { mode: 'full' } },
        }],
      },
    });

    expect(parsed.contributions.components.map((entry) => entry.id)).toEqual([
      'search-one',
      'search-two',
    ]);
    expect(parsed.contributions.controls[0]).toMatchObject({
      id: 'indexing',
      action: { tool: 'enable_index', params: { mode: 'full' } },
    });
    expect(parsed.diagnostics).toEqual([]);
  });

  it('normalises legacy fields and gives explicit entries precedence', () => {
    const parsed = parseAppContributions({
      search: { component: 'LegacySearch' },
      widgets: [
        { id: 'same', name: 'Legacy same', component: 'LegacySame' },
        { id: 'other', name: 'Legacy other', component: 'LegacyOther' },
      ],
      contributes: {
        components: [
          {
            id: 'new-search',
            extensionPoint: 'ui.global-search.panel',
            component: 'NewSearch',
          },
          {
            id: 'same',
            extensionPoint: 'ui.dashboard.widget',
            component: 'NewSame',
            name: 'New same',
          },
        ],
      },
    });

    expect(parsed.contributions.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'new-search', component: 'NewSearch' }),
      expect.objectContaining({ id: 'same', component: 'NewSame' }),
      expect.objectContaining({ id: 'other', component: 'LegacyOther' }),
    ]));
    expect(parsed.contributions.components).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ component: 'LegacySearch' }),
      expect.objectContaining({ component: 'LegacySame' }),
    ]));
  });

  it('isolates unknown, malformed and duplicate entries with diagnostics', () => {
    const parsed = parseAppContributions({
      contributes: {
        components: [
          { id: 'shared', extensionPoint: 'ui.titlebar.control', component: 'Good' },
          { id: 'unknown', extensionPoint: 'ui.future.surface', component: 'Future' },
        ],
        controls: [
          {
            id: 'shared',
            extensionPoint: 'workspace.create.option',
            control: { type: 'switch', label: 'Duplicate', defaultValue: true },
            action: { type: 'tool', tool: 'duplicate' },
          },
          {
            id: 'invalid',
            extensionPoint: 'workspace.create.option',
            control: { type: 'button', label: 'Unsupported' },
            action: { type: 'shell', command: 'nope' },
          },
        ],
      },
    });

    expect(parsed.contributions.components).toHaveLength(1);
    expect(parsed.contributions.controls).toHaveLength(0);
    expect(parsed.diagnostics.map((entry) => entry.code)).toEqual([
      'unknown-extension-point',
      'invalid-contribution',
      'duplicate-id',
    ]);
  });

  it('suppresses federated components but retains host controls', () => {
    const parsed = parseAppContributions({
      search: { component: 'LegacySearch' },
      workspaceCreation: { label: 'Enable indexing', tool: 'enable_index' },
    }, { suppressUi: true });

    expect(parsed.contributions.components).toEqual([]);
    expect(parsed.contributions.controls).toHaveLength(1);
  });

  it('logs non-fatal contribution diagnostics with package context', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const parsed = parseAppContributions({
      contributes: {
        components: [{
          id: 'future',
          extensionPoint: 'ui.future.surface',
          component: 'FuturePanel',
        }],
      },
    });

    warnContributionDiagnostics('/tmp/future-plugin', parsed.diagnostics);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('/tmp/future-plugin'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown-extension-point'));
    warn.mockRestore();
  });
});
