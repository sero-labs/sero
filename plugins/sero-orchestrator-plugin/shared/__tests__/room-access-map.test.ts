/**
 * The access map has to agree with the host about which tools reach a remote.
 *
 * When it did not, a Room could be approved and then fail to start: the planner
 * offered `git_manager` to an `edit-workspace` team because no rule matched it,
 * the host removed it at approval because its VCS group needs `vcs: 'push'`,
 * and the member's session still asked for it. The Conductor was denied
 * (`tool-not-allowed`) and the Room paused with zero turns taken.
 *
 * These names are duplicated from
 * `apps/desktop/electron/features/apps/runtime/capabilities/persistent-sessions/permission-tools.ts`
 * because the two live in different packages. If that list gains a tool, this
 * test should fail until this map gains it too.
 */

import { describe, expect, it } from 'vitest';
import { accessLabelForCapability } from '../room-access-map';

/** The host grants these only to a member with `vcs: 'push'`. */
const HOST_VCS_WRITE_TOOLS = ['git_push', 'gh', 'create_pr', 'git_manager'];

describe('access labels for remote-reaching tools', () => {
  it.each(HOST_VCS_WRITE_TOOLS)('labels %s as github-write', (tool) => {
    expect(accessLabelForCapability(tool)).toBe('github-write');
  });

  it('still labels plain reading as read-only GitHub access', () => {
    expect(accessLabelForCapability('octokit')).toBe('read-github');
  });

  it('leaves an unrelated tool unlabelled, so it is disclosed not blocked', () => {
    expect(accessLabelForCapability('grep')).not.toBe('github-write');
  });
});
