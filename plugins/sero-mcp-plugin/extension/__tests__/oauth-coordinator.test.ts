import { describe, expect, it } from 'vitest';
import { parseOAuthCallbackUrl } from '../auth/oauth-coordinator';

describe('parseOAuthCallbackUrl', () => {
  it('extracts the authorization code and validates state', () => {
    expect(
      parseOAuthCallbackUrl('http://127.0.0.1:19876/mcp/oauth/callback?code=abc123&state=expected', 'expected'),
    ).toEqual({ code: 'abc123' });
  });

  it('throws when the callback contains an OAuth error', () => {
    expect(() => {
      parseOAuthCallbackUrl('http://127.0.0.1:19876/mcp/oauth/callback?error=access_denied');
    }).toThrow(/access_denied/);
  });

  it('throws when the state does not match', () => {
    expect(() => {
      parseOAuthCallbackUrl('http://127.0.0.1:19876/mcp/oauth/callback?code=abc123&state=wrong', 'expected');
    }).toThrow(/did not match/);
  });
});
