// @vitest-environment jsdom

/**
 * Every write the Git app makes goes through one call on the host's vcs bridge
 * (AD-025, issue #305). It used to have a bridge of its own, so the app read
 * through one door and wrote through another.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runGitAction } from './sero-bridge';

const run = vi.fn();

beforeEach(() => {
  run.mockReset().mockResolvedValue({ ok: true, message: 'Fetched all remotes.' });
  Reflect.set(window, 'sero', { vcs: { run }, appState: {} });
});

describe('runGitAction', () => {
  it('hands the action to the vcs bridge and returns what it says', async () => {
    const result = await runGitAction('ws-1', { action: 'fetch' });

    expect(run).toHaveBeenCalledWith('ws-1', { action: 'fetch' });
    expect(result).toEqual({ ok: true, message: 'Fetched all remotes.' });
  });

  it('passes a refusal straight back, rather than treating it as a failure', async () => {
    run.mockResolvedValue({ ok: false, message: 'Cannot delete the current branch main.' });

    await expect(runGitAction('ws-1', { action: 'delete_branch', branch: 'main' }))
      .resolves.toEqual({ ok: false, message: 'Cannot delete the current branch main.' });
  });

  it('says so plainly on a host too old to have the action bridge', async () => {
    Reflect.set(window, 'sero', { vcs: {}, appState: {} });

    const result = await runGitAction('ws-1', { action: 'fetch' });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('Update Sero');
  });

  it('fails loudly outside the Sero shell, where there is no bridge at all', async () => {
    Reflect.set(window, 'sero', undefined);

    await expect(runGitAction('ws-1', { action: 'fetch' })).rejects.toThrow('window.sero');
  });
});
