import { describe, expect, it, afterEach } from 'vitest';
import path from 'path';
import type { SeroAppManifest } from '@/types/sero-apps';
import { hasRemoteAssets } from '@electron/features/gateway/server/ext-assets';
import {
  buildStateKey,
  listRemoteWidgets,
  registerRemoteWidgets,
  resetRemoteWidgets,
  resolveStateFile,
  toRemoteName,
} from '@electron/features/gateway/server/remote-widgets';

/** A manifest with one widget, which opts in only when asked to. */
function manifestWith(options: {
  id: string;
  remote: boolean;
  scope?: 'global' | 'workspace';
}): SeroAppManifest {
  return {
    id: options.id,
    name: options.id,
    scope: options.scope ?? 'workspace',
    stateFile: '.sero/state.json',
    globalStatePath: `/profile/${options.id}.json`,
    uiEntry: 'dist/ui/remoteEntry.js',
    component: 'App',
    packagePath: `/plugins/${options.id}`,
    contributions: {
      components: [
        {
          extensionPoint: 'ui.dashboard.widget',
          id: 'summary',
          name: 'Summary',
          component: 'Summary',
          defaultSize: { w: 4, h: 3 },
          remote: options.remote,
        },
      ],
    },
  } as unknown as SeroAppManifest;
}

const ticketFor = (appId: string) => `ticket-${appId}`;

afterEach(() => {
  resetRemoteWidgets();
});

describe('remote widget registry', () => {
  it('lists a widget that opted in, and serves its assets', () => {
    registerRemoteWidgets(manifestWith({ id: 'todo', remote: true }));

    const listed = listRemoteWidgets('ws-1', ticketFor);

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      appId: 'todo',
      widgetId: 'summary',
      remoteName: 'sero_todo',
      remoteEntry: '/ext/ticket-todo/todo/mf-manifest.json',
      stateKey: 'todo@ws-1',
    });
    expect(hasRemoteAssets('todo')).toBe(true);
  });

  it('does not list a widget that never opted in, and serves nothing', () => {
    registerRemoteWidgets(manifestWith({ id: 'todo', remote: false }));

    expect(listRemoteWidgets('ws-1', ticketFor)).toEqual([]);
    expect(hasRemoteAssets('todo')).toBe(false);
  });

  it('derives the remote name the desktop uses', () => {
    expect(toRemoteName('my-plugin')).toBe('sero_my_plugin');
  });

  it('keys a global widget by app alone', () => {
    expect(buildStateKey('todo', 'global', 'ws-1')).toBe('todo');
    expect(buildStateKey('todo', 'workspace', 'ws-1')).toBe('todo@ws-1');
  });
});

describe('resolveStateFile', () => {
  const reachable = (workspaceId: string) =>
    workspaceId === 'ws-1' ? '/work/ws-1' : null;

  it('resolves a workspace widget under its workspace root', () => {
    registerRemoteWidgets(manifestWith({ id: 'todo', remote: true }));

    expect(resolveStateFile('todo@ws-1', reachable)).toBe(
      path.resolve('/work/ws-1', '.sero/state.json'),
    );
  });

  it('refuses a workspace this token cannot reach', () => {
    registerRemoteWidgets(manifestWith({ id: 'todo', remote: true }));

    expect(resolveStateFile('todo@ws-2', reachable)).toBeNull();
  });

  it('refuses a key for an app with no remote widget', () => {
    registerRemoteWidgets(manifestWith({ id: 'todo', remote: false }));

    expect(resolveStateFile('todo@ws-1', reachable)).toBeNull();
  });

  it('resolves a global widget to the profile file, with no workspace', () => {
    registerRemoteWidgets(manifestWith({ id: 'notes', remote: true, scope: 'global' }));

    expect(resolveStateFile('notes', reachable)).toBe('/profile/notes.json');
  });
});
