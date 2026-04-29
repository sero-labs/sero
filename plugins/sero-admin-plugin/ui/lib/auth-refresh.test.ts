import { describe, expect, it } from 'vitest';
import { shouldRefreshForAuthEvent } from './auth-refresh';

describe('admin bridge refresh events', () => {
  it('refreshes for auth completion states', () => {
    expect(shouldRefreshForAuthEvent({ type: 'success' })).toBe(true);
    expect(shouldRefreshForAuthEvent({ type: 'error' })).toBe(true);
    expect(shouldRefreshForAuthEvent({ type: 'cancelled' })).toBe(true);
  });

  it('ignores in-flight auth progress events', () => {
    expect(shouldRefreshForAuthEvent({ type: 'auth' })).toBe(false);
    expect(shouldRefreshForAuthEvent({ type: 'waiting' })).toBe(false);
    expect(shouldRefreshForAuthEvent({ type: 'progress' })).toBe(false);
  });
});
