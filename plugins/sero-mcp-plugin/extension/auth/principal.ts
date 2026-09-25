import { createHash, randomUUID } from 'node:crypto';
import { resolveBearerTokenValue, type McpServerConfig } from '../config/types';
import { readOAuthTokens, writeOAuthTokens } from './storage';

/**
 * Names the account that a connection uses, so that cached server data is
 * never shared between accounts. `anon` for no auth, a hash for a bearer token
 * (the token itself is never stored), and the random ID of the OAuth
 * authorization.
 */
export async function resolvePrincipalId(serverName: string, definition: McpServerConfig): Promise<string> {
  if (definition.auth === 'bearer') {
    const token = resolveBearerTokenValue(definition);
    return token ? `bearer:${createHash('sha256').update(token).digest('hex')}` : 'anon';
  }
  if (definition.auth === 'oauth') {
    const tokens = await readOAuthTokens(serverName, definition.url);
    if (!tokens) return 'anon';
    if (tokens.principalId) return `oauth:${tokens.principalId}`;
    // Tokens saved before principals existed get one on first use.
    const principalId = randomUUID();
    await writeOAuthTokens(serverName, { ...tokens, principalId });
    return `oauth:${principalId}`;
  }
  return 'anon';
}
