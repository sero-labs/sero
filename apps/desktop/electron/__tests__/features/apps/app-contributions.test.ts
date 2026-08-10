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

  it('defaults an omitted explicit switch value to false', () => {
    const parsed = parseAppContributions({
      contributes: {
        controls: [{
          id: 'indexing',
          extensionPoint: 'workspace.create.option',
          control: { type: 'switch', label: 'Enable indexing' },
          action: { type: 'tool', tool: 'enable_index' },
        }],
      },
    });

    expect(parsed.contributions.controls).toEqual([expect.objectContaining({
      id: 'indexing',
      control: { type: 'switch', label: 'Enable indexing', defaultValue: false },
    })]);
    expect(parsed.diagnostics).toEqual([]);
  });

  it('rejects an explicit switch value that is present but not boolean', () => {
    const parsed = parseAppContributions({
      contributes: {
        controls: [{
          id: 'indexing',
          extensionPoint: 'workspace.create.option',
          control: { type: 'switch', label: 'Enable indexing', defaultValue: 'yes' },
          action: { type: 'tool', tool: 'enable_index' },
        }],
      },
    });

    expect(parsed.contributions.controls).toEqual([]);
    expect(parsed.diagnostics.map((entry) => entry.code)).toEqual(['invalid-contribution']);
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
          { id: 'shared', extensionPoint: 'ui.titlebar.control', component: 'Duplicate' },
          { id: 'unknown', extensionPoint: 'ui.future.surface', component: 'Future' },
        ],
        controls: [
          {
            id: 'invalid',
            extensionPoint: 'workspace.create.option',
            control: { type: 'button', label: 'Unsupported' },
            action: { type: 'shell', command: 'nope' },
          },
        ],
      },
    });

    expect(parsed.contributions.components).toEqual([
      expect.objectContaining({ id: 'shared', component: 'Good' }),
    ]);
    expect(parsed.contributions.controls).toHaveLength(0);
    expect(parsed.diagnostics.map((entry) => entry.code)).toEqual([
      'unknown-extension-point',
      'invalid-contribution',
      'duplicate-id',
    ]);
  });

  it('keeps the same id in two different extension points', () => {
    const parsed = parseAppContributions({
      contributes: {
        components: [
          { id: 'shared', extensionPoint: 'ui.titlebar.control', component: 'Control' },
        ],
        controls: [
          {
            id: 'shared',
            extensionPoint: 'workspace.create.option',
            control: { type: 'switch', label: 'Shared', defaultValue: true },
            action: { type: 'tool', tool: 'shared' },
          },
        ],
      },
    });

    expect(parsed.contributions.components).toHaveLength(1);
    expect(parsed.contributions.controls).toHaveLength(1);
    expect(parsed.diagnostics).toEqual([]);
  });

  it('keeps every widget whose id matches a host-generated legacy id', () => {
    const parsed = parseAppContributions({
      search: { component: 'LegacySearch' },
      explorerView: { component: 'LegacyExplorer' },
      titlebar: { component: 'LegacyTitlebar' },
      workspaceCreation: { label: 'Enable indexing', tool: 'enable_index' },
      widgets: [
        { id: 'global-search', name: 'Search stats', component: 'SearchStats' },
        { id: 'explorer-view', name: 'Explorer stats', component: 'ExplorerStats' },
        { id: 'titlebar-control', name: 'Titlebar stats', component: 'TitlebarStats' },
        { id: 'workspace-creation', name: 'Workspace stats', component: 'WorkspaceStats' },
      ],
    });

    const widgets = parsed.contributions.components.filter(
      (entry) => entry.extensionPoint === 'ui.dashboard.widget',
    );
    expect(widgets.map((entry) => entry.component)).toEqual([
      'SearchStats',
      'ExplorerStats',
      'TitlebarStats',
      'WorkspaceStats',
    ]);
    expect(parsed.contributions.components.map((entry) => entry.component)).toEqual(
      expect.arrayContaining(['LegacySearch', 'LegacyExplorer', 'LegacyTitlebar']),
    );
    expect(parsed.contributions.controls).toEqual([
      expect.objectContaining({ id: 'workspace-creation' }),
    ]);
    expect(parsed.diagnostics).toEqual([]);
  });

  it('reports a duplicate legacy widget id inside one extension point', () => {
    const parsed = parseAppContributions({
      widgets: [
        { id: 'stats', name: 'Stats one', component: 'StatsOne' },
        { id: 'stats', name: 'Stats two', component: 'StatsTwo' },
      ],
    });

    expect(parsed.contributions.components).toEqual([
      expect.objectContaining({ component: 'StatsOne' }),
    ]);
    expect(parsed.diagnostics.map((entry) => entry.code)).toEqual(['duplicate-id']);
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
