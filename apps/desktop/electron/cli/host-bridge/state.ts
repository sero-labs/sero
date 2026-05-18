import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import { SERO_AGENT_DIR, SERO_FIXED_ROOT, SERO_HOME } from '@electron/platform/env';
import { prependPathEntries } from '@electron/features/workspace/runtime/toolchains/path-env';

export interface SeroCliBridgeConnection {
  endpoint: string;
}

export interface SeroCliBridgeTokenScope {
  workspaceId: string;
  sessionId: string | null;
}

export interface SeroCliEnvOptions {
  workspaceId?: string;
  sessionId?: string | null;
}

const BRIDGE_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BRIDGE_TOKENS = 1024;

interface SeroCliBridgeTokenRecord extends SeroCliBridgeTokenScope {
  expiresAt: number;
}

let bridgeConnection: SeroCliBridgeConnection | null = null;
const bridgeTokens = new Map<string, SeroCliBridgeTokenRecord>();

export function managedSeroCliBinDir(): string {
  return path.join(SERO_FIXED_ROOT, 'bin');
}

export function setSeroCliBridgeConnection(connection: SeroCliBridgeConnection): void {
  bridgeConnection = connection;
}

export function getSeroCliBridgeConnection(): SeroCliBridgeConnection | null {
  return bridgeConnection;
}

export function mintSeroCliBridgeToken(scope: SeroCliBridgeTokenScope): string {
  const now = Date.now();
  pruneExpiredBridgeTokens(now);
  const token = crypto.randomBytes(32).toString('hex');
  bridgeTokens.set(token, {
    workspaceId: scope.workspaceId,
    sessionId: scope.sessionId,
    expiresAt: now + BRIDGE_TOKEN_TTL_MS,
  });
  pruneOverflowBridgeTokens();
  return token;
}

export function getSeroCliBridgeTokenScope(token: string): SeroCliBridgeTokenScope | null {
  const now = Date.now();
  pruneExpiredBridgeTokens(now);
  const record = bridgeTokens.get(token);
  if (!record) return null;
  if (record.expiresAt <= now) {
    bridgeTokens.delete(token);
    return null;
  }
  return { workspaceId: record.workspaceId, sessionId: record.sessionId };
}

function pruneExpiredBridgeTokens(now: number): void {
  for (const [token, record] of bridgeTokens) {
    if (record.expiresAt <= now) bridgeTokens.delete(token);
  }
}

function pruneOverflowBridgeTokens(): void {
  while (bridgeTokens.size > MAX_BRIDGE_TOKENS) {
    const oldestToken = bridgeTokens.keys().next().value;
    if (!oldestToken) return;
    bridgeTokens.delete(oldestToken);
  }
}

export function clearSeroCliBridgeStateForTests(): void {
  bridgeConnection = null;
  bridgeTokens.clear();
}

export function addSeroCliEnv(
  env: Record<string, string>,
  options: SeroCliEnvOptions,
  platform: NodeJS.Platform = process.platform,
): Record<string, string> {
  const withPath = prependPathEntries(env, [managedSeroCliBinDir()], platform);
  const next: Record<string, string> = {
    ...withPath,
    SERO_HOME,
    SERO_AGENT_DIR,
    PI_CODING_AGENT_DIR: SERO_AGENT_DIR,
  };

  if (options.workspaceId) next.SERO_WORKSPACE_ID = options.workspaceId;
  if (options.sessionId) next.SERO_SESSION_ID = options.sessionId;

  if (bridgeConnection && options.workspaceId) {
    next.SERO_CLI_ENDPOINT = bridgeConnection.endpoint;
    next.SERO_CLI_TOKEN = mintSeroCliBridgeToken({
      workspaceId: options.workspaceId,
      sessionId: options.sessionId ?? null,
    });
  }

  return next;
}

export async function ensureSeroCliShim(
  options: { binDir?: string; platform?: NodeJS.Platform } = {},
): Promise<void> {
  const platform = options.platform ?? process.platform;
  const binDir = options.binDir ?? managedSeroCliBinDir();
  await fs.promises.mkdir(binDir, { recursive: true });

  if (platform === 'win32') {
    await writeIfChanged(path.join(binDir, 'sero.js'), nodeShimSource());
    await writeIfChanged(path.join(binDir, 'sero.cmd'), windowsShimSource());
    return;
  }

  const shimPath = path.join(binDir, 'sero');
  await writeIfChanged(shimPath, nodeShimSource());
  await fs.promises.chmod(shimPath, 0o755);
}

async function writeIfChanged(filePath: string, content: string): Promise<void> {
  const existing = await fs.promises.readFile(filePath, 'utf8').catch(() => null);
  if (existing === content) return;
  await fs.promises.writeFile(filePath, content, 'utf8');
}

function windowsShimSource(): string {
  return [
    '@echo off',
    'node "%~dp0sero.js" %*',
    '',
  ].join('\r\n');
}

function nodeShimSource(): string {
  return `#!/usr/bin/env node
const http = require('node:http');
const https = require('node:https');

function exitWith(message, code) {
  process.stderr.write(String(message).trimEnd() + '\\n');
  process.exit(code);
}

const endpoint = process.env.SERO_CLI_ENDPOINT;
const token = process.env.SERO_CLI_TOKEN;
if (!endpoint || !token) {
  exitWith('Sero CLI is unavailable: launch this command from a Sero-managed host runtime or terminal.', 127);
}

const payload = JSON.stringify({
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  workspaceId: process.env.SERO_WORKSPACE_ID || null,
  sessionId: process.env.SERO_SESSION_ID || null,
});

let url;
try {
  url = new URL(endpoint);
} catch (error) {
  exitWith('Sero CLI is unavailable: invalid bridge endpoint.', 127);
}

const client = url.protocol === 'https:' ? https : http;
const req = client.request(url, {
  method: 'POST',
  headers: {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  },
}, (res) => {
  let body = '';
  res.setEncoding('utf8');
  res.on('data', (chunk) => { body += chunk; });
  res.on('end', () => {
    if (res.statusCode !== 200) {
      exitWith(body || ('Sero CLI bridge failed with HTTP ' + res.statusCode), 1);
    }
    let result;
    try {
      result = JSON.parse(body);
    } catch (error) {
      exitWith('Sero CLI bridge returned invalid JSON.', 1);
    }
    const output = typeof result.output === 'string' ? result.output : '';
    const exitCode = Number.isInteger(result.exitCode) ? result.exitCode : 1;
    const stream = exitCode === 0 ? process.stdout : process.stderr;
    if (output) {
      stream.write(output);
      if (!output.endsWith('\\n')) stream.write('\\n');
    }
    process.exit(exitCode);
  });
});

req.on('error', (error) => {
  exitWith('Sero CLI is unavailable: ' + error.message, 127);
});

req.write(payload);
req.end();
`;
}
