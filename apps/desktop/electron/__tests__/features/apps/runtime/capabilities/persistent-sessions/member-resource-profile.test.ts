/**
 * What a member session can actually reach.
 *
 * This runs the real resource loader against a real plugin package, because
 * every part of it that broke in the live gate looked correct in isolation: a
 * loader nobody loaded reports no extensions, an unbridged extension registers
 * no commands, and a member with the shared registry can drive the desktop.
 * None of that is visible from the types.
 */

import path from 'path';
import { mkdtemp, realpath } from 'fs/promises';
import os from 'os';
import { describe, expect, it } from 'vitest';
import { SettingsManager } from '@earendil-works/pi-coding-agent';

import { bridgeExtensionTools, createPrivateCliRegistry, getCliRegistry } from '@electron/cli';
import { createMemberResourceLoader } from '@electron/features/apps/runtime/capabilities/persistent-sessions/resource-profile';

/** The Room's own plugin — the app a Room member's grant belongs to. */
const ORCHESTRATOR = path.resolve(process.cwd(), '../../plugins/sero-orchestrator-plugin');
const SCOPE = 'grant_test:conductor';

async function memberSurface() {
  const cwd = await realpath(await mkdtemp(path.join(os.tmpdir(), 'sero-member-profile-')));
  const registry = createPrivateCliRegistry();
  const loader = await createMemberResourceLoader({
    cwd,
    allowedSkills: [],
    appendSystemPrompt: [],
    settingsManager: await SettingsManager.create(cwd, path.join(cwd, 'agent')),
    packages: [ORCHESTRATOR],
    extensionFactories: [],
    bridgeExtensions: (base) => bridgeExtensionTools(base, { sessionId: SCOPE, registry }),
  });
  return { loader, registry };
}

describe('the member resource profile', () => {
  it('gives the member the Room command surface of the app that holds its grant', async () => {
    const { loader, registry } = await memberSurface();

    // The loader must come back LOADED: createAgentSession only loads a loader
    // it built itself, so an unloaded one silently produces a member with no
    // extensions, no commands and no way to speak to its own Room.
    expect(loader.getExtensions().extensions.map((extension) => extension.resolvedPath))
      .toEqual([path.join(ORCHESTRATOR, 'extension/index.ts')]);

    expect(registry.list({ sessionId: SCOPE }).map((command) => command.name)).toContain('room');
  }, 60_000);

  it('does not put the shared Sero commands on that surface', async () => {
    const { registry } = await memberSurface();

    const names = registry.list({ sessionId: SCOPE }).map((command) => command.name);
    // `app` drives the desktop: open an app, click at a point, type into it. A
    // member that cannot find a Room command WILL reach for it.
    expect(names).not.toContain('app');
    expect(names).not.toContain('workspace');
    // And the shared registry is the one that has them, so the test is comparing
    // two real surfaces rather than an empty one against itself.
    expect(getCliRegistry().list().map((command) => command.name)).toContain('app');
  }, 60_000);
});
