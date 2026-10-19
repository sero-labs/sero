/**
 * `mcp_manager` auth steps against a local OAuth server (`mcp-oauth-stub.ts`),
 * so no real account is used. Sero's own OAuth client runs the whole flow:
 * discovery, client registration, the sign-in link, the code exchange and the
 * token files it keeps under `<profile>/agent/mcp-oauth/<server>/`.
 *
 * Order: start a flow and cancel it, start another and complete it, then clear
 * the saved sign-in.
 */
import fs from 'node:fs';
import path from 'node:path';
import { expectText } from '../expect';
import type { ScenarioStep, StepContext, ToolCallResult } from '../types';
import { startOAuthStub, type OAuthStub } from './mcp-oauth-stub';
import {
  detailsOf,
  ensurePaths,
  httpFixtureUrl,
  oauthDir,
  OAUTH_SERVER,
  readJson,
  serverState,
  stdioServerParams,
  stringDetail,
  viaAppOk,
} from './mcp-support';

const CALLBACK = 'http://127.0.0.1:19876/mcp/oauth/callback';

async function stub(): Promise<OAuthStub> {
  return startOAuthStub(await httpFixtureUrl());
}

/** Registers the OAuth server. Naming it as its own original lets the setup repeat. */
async function ensureOauthServer(ctx: StepContext): Promise<void> {
  await ensurePaths(ctx);
  ctx.state.issuer = (await stub()).issuer;
  await viaAppOk(ctx, 'mcp_manager', {
    ...stdioServerParams,
    serverName: OAUTH_SERVER,
    originalServerName: OAUTH_SERVER,
    transport: 'http',
    url: (await stub()).url,
    command: '',
    argsText: '',
    authMode: 'oauth',
  });
}

function flowFile(ctx: StepContext): string {
  return path.join(oauthDir(ctx, OAUTH_SERVER), 'flow.json');
}

/** Checks a started flow: the link names the stub and a state, and the plugin kept that state to check the callback. */
function expectStarted(result: ToolCallResult, ctx: StepContext, issuer: string): void {
  expectText(result, `Authentication started for MCP server "${OAUTH_SERVER}".`);
  const authUrl = new URL(stringDetail(result, 'authUrl'));
  if (authUrl.origin !== issuer || authUrl.pathname !== '/authorize') throw new Error(`unexpected sign-in link: ${authUrl.href}`);
  const state = authUrl.searchParams.get('state');
  if (!state) throw new Error(`the sign-in link has no state: ${authUrl.href}`);
  const kept = readJson<{ oauthState?: string }>(flowFile(ctx)).oauthState;
  if (kept !== state) throw new Error(`flow.json keeps state ${kept}, the link has ${state}`);
  if (serverState(ctx, OAUTH_SERVER).authStatus !== 'authenticating') throw new Error('state.json does not show the server as authenticating');
  ctx.state.oauthState = state;
}

export const authSteps: ScenarioStep[] = [
  {
    action: 'start_auth',
    setup: ensureOauthServer,
    params: { action: 'start_auth', serverName: OAUTH_SERVER },
    expect: async (result, ctx) => expectStarted(result, ctx, (await stub()).issuer),
  },
  {
    action: 'cancel_auth',
    params: { action: 'cancel_auth', serverName: OAUTH_SERVER },
    expect(result, ctx) {
      expectText(result, `Cancelled authentication for MCP server "${OAUTH_SERVER}".`);
      // The flow's saved state is gone, so a later callback has nothing to match.
      if (fs.existsSync(flowFile(ctx))) throw new Error('flow.json is still there after the cancel');
      if (serverState(ctx, OAUTH_SERVER).authStatus !== 'not-authenticated') throw new Error('state.json does not show the server as not authenticated');
    },
  },
  {
    // A second flow, which the next step completes.
    action: 'start_auth',
    params: { action: 'start_auth', serverName: OAUTH_SERVER },
    expect: async (result, ctx) => {
      const before = ctx.state.oauthState;
      expectStarted(result, ctx, (await stub()).issuer);
      if (ctx.state.oauthState === before) throw new Error('the second flow reused the first flow\'s state');
    },
  },
  {
    action: 'complete_auth',
    // The callback a browser would be sent to: a code, the flow's state, and the issuer the metadata names.
    params: (ctx) => {
      const callback = new URL(CALLBACK);
      callback.searchParams.set('code', 'auth-code');
      callback.searchParams.set('state', String(ctx.state.oauthState));
      callback.searchParams.set('iss', String(ctx.state.issuer));
      return { action: 'complete_auth', serverName: OAUTH_SERVER, callbackUrl: callback.href };
    },
    expect: async (result, ctx) => {
      expectText(result, `Completed authentication for MCP server "${OAUTH_SERVER}".`);
      // The stub's token endpoint issued a token, and Sero saved it.
      if ((await stub()).issuedTokens() < 1) throw new Error('the token endpoint issued no token');
      const saved = readJson<{ tokens: { access_token: string } }>(path.join(oauthDir(ctx, OAUTH_SERVER), 'tokens.json'));
      if (!saved.tokens.access_token.startsWith('issued-token-')) throw new Error(`unexpected saved token: ${saved.tokens.access_token}`);
      if (fs.existsSync(flowFile(ctx))) throw new Error('flow.json is still there after the sign-in');
      // With the token, the server connects through the stub to the fixture.
      const details = detailsOf(result);
      if (details.authStatus !== 'authenticated' || details.connectionStatus !== 'connected') {
        throw new Error(`after sign-in: auth ${String(details.authStatus)}, connection ${String(details.connectionStatus)}`);
      }
      if (serverState(ctx, OAUTH_SERVER).authStatus !== 'authenticated') throw new Error('state.json does not show the server as authenticated');
    },
  },
  {
    action: 'clear_auth',
    params: { action: 'clear_auth', serverName: OAUTH_SERVER },
    expect(result, ctx) {
      expectText(result, `Cleared saved authentication for MCP server "${OAUTH_SERVER}".`);
      if (fs.existsSync(oauthDir(ctx, OAUTH_SERVER))) throw new Error('the saved sign-in folder is still there');
      if (detailsOf(result).authStatus !== 'not-authenticated') throw new Error(`auth status is ${String(detailsOf(result).authStatus)}`);
    },
  },
];
