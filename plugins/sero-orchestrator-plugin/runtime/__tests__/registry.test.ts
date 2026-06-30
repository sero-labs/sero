import { afterEach, describe, expect, it } from 'vitest';
import { Coordinator } from '../coordinator';
import {
  getCoordinator,
  registerCoordinator,
  registeredWorkspaceIds,
  resolveCoordinatorByCwd,
  unregisterCoordinator,
} from '../registry';
import { createFakeHost } from './fake-host';

afterEach(() => {
  for (const id of registeredWorkspaceIds()) unregisterCoordinator(id);
});

describe('coordinator registry', () => {
  it('registers and resolves by workspaceId', () => {
    const coordinator = new Coordinator(createFakeHost());
    registerCoordinator('ws-1', '/workspaces/ws-1', coordinator);
    expect(getCoordinator('ws-1')).toBe(coordinator);
    expect(getCoordinator('ws-2')).toBeUndefined();
  });

  it('resolves the coordinator by cwd, preferring the deepest match', () => {
    const outer = new Coordinator(createFakeHost({ workspaceId: 'outer' }));
    const inner = new Coordinator(createFakeHost({ workspaceId: 'inner' }));
    registerCoordinator('outer', '/repos', outer);
    registerCoordinator('inner', '/repos/project', inner);

    expect(resolveCoordinatorByCwd('/repos/project/src')).toBe(inner);
    expect(resolveCoordinatorByCwd('/repos/other')).toBe(outer);
    expect(resolveCoordinatorByCwd('/elsewhere')).toBeUndefined();
  });

  it('unregister removes the coordinator', () => {
    registerCoordinator('ws-1', '/workspaces/ws-1', new Coordinator(createFakeHost()));
    unregisterCoordinator('ws-1');
    expect(getCoordinator('ws-1')).toBeUndefined();
  });

  it('stores the registry on globalThis so separately-loaded modules share it', () => {
    const coordinator = new Coordinator(createFakeHost());
    registerCoordinator('ws-shared', '/workspaces/ws-shared', coordinator);
    // A second module instance (runtime bundle vs extension bundle) reaches the
    // same Map via this global key — the fix for the two-loader split.
    const shared = (globalThis as Record<string, unknown>)['__seroOrchestratorCoordinators__'] as
      | Map<string, { coordinator: Coordinator }>
      | undefined;
    expect(shared?.get('ws-shared')?.coordinator).toBe(coordinator);
  });
});
