import os from 'os';
import path from 'path';
import net from 'net';
import { createServer, type Server } from 'http';
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ensurePluginDevServer,
  stopAllPluginDevServers,
  stopPluginDevServer,
} from '@electron/features/plugins/dev-sessions/dev-server';

const tempRoots: string[] = [];

async function createTempSource(options: { builtUi?: boolean } = {}): Promise<string> {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'sero-plugin-dev-server-'));
  tempRoots.push(tempRoot);

  if (options.builtUi) {
    await mkdir(path.join(tempRoot, 'dist', 'ui'), { recursive: true });
    await writeFile(path.join(tempRoot, 'dist', 'ui', 'mf-manifest.json'), '{"metaData":{}}');
  }

  return tempRoot;
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('Failed to determine free port'));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
    server.on('error', reject);
  });
}

function toRemoteName(appId: string): string {
  return `sero_${appId.replace(/-/g, '_')}`;
}

function buildHealthyServerCommand(port: number, remoteName: string): string {
  const script = [
    "const http = require('http');",
    "const server = http.createServer((req, res) => {",
    "if (req.url === '/mf-manifest.json') {",
    "res.writeHead(200, { 'content-type': 'application/json' });",
    `res.end(JSON.stringify({ id: ${JSON.stringify(remoteName)}, name: ${JSON.stringify(remoteName)}, metaData: { name: ${JSON.stringify(remoteName)} } }));`,
    'return;',
    '}',
    "res.writeHead(404);",
    "res.end('missing');",
    '});',
    `server.listen(${port}, '127.0.0.1');`,
  ].join(' ');
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

function buildFailingCommand(): string {
  const script = `process.stderr.write('boom from dev server'); process.exit(1);`;
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

async function startUnmanagedManifestServer(port: number, remoteName: string): Promise<Server> {
  return await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      if (req.url === '/mf-manifest.json') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          id: remoteName,
          name: remoteName,
          metaData: { name: remoteName },
        }));
        return;
      }

      res.writeHead(404);
      res.end('missing');
    });

    server.listen(port, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

afterEach(async () => {
  await stopAllPluginDevServers();
  await Promise.all(tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('ensurePluginDevServer', () => {
  it('starts a host-side dev server and resolves a localhost remote override', async () => {
    const sourcePath = await createTempSource();
    const port = await getFreePort();
    const appId = 'todo-plugin';

    const result = await ensurePluginDevServer({
      appId,
      sourcePath,
      declaredDevPort: port,
      command: buildHealthyServerCommand(port, toRemoteName(appId)),
      hasDeclaredUi: true,
      hasBuiltUi: false,
    });

    expect(result).toEqual({
      remoteEntryOverride: `http://127.0.0.1:${port}/mf-manifest.json`,
      uiMode: 'dev-server',
      error: null,
    });

    await stopPluginDevServer(sourcePath);
  });

  it('falls back to built UI when the host dev server fails to become healthy', async () => {
    const sourcePath = await createTempSource({ builtUi: true });
    const port = await getFreePort();

    const result = await ensurePluginDevServer({
      appId: 'todo-plugin',
      sourcePath,
      declaredDevPort: port,
      command: buildFailingCommand(),
      hasDeclaredUi: true,
      hasBuiltUi: true,
    });

    expect(result.uiMode).toBe('built-fallback');
    expect(result.remoteEntryOverride).toBeNull();
    expect(result.error).toContain('Dev server start failed');
  });

  it('refuses to reuse a matching pre-existing unmanaged localhost remote on the configured port', async () => {
    const sourcePath = await createTempSource({ builtUi: true });
    const port = await getFreePort();
    const appId = 'todo-plugin';
    const unmanagedServer = await startUnmanagedManifestServer(port, toRemoteName(appId));

    try {
      const result = await ensurePluginDevServer({
        appId,
        sourcePath,
        declaredDevPort: port,
        command: buildHealthyServerCommand(port, toRemoteName(appId)),
        hasDeclaredUi: true,
        hasBuiltUi: true,
      });

      expect(result).toEqual({
        remoteEntryOverride: null,
        uiMode: 'built-fallback',
        error: expect.stringContaining('Refusing to reuse an unmanaged local plugin UI dev server'),
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        unmanagedServer.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('refuses to reuse an unrelated pre-existing localhost remote on the configured port', async () => {
    const sourcePath = await createTempSource({ builtUi: true });
    const port = await getFreePort();
    const unrelatedServer = await startUnmanagedManifestServer(port, 'sero_other_plugin');

    try {
      const result = await ensurePluginDevServer({
        appId: 'todo-plugin',
        sourcePath,
        declaredDevPort: port,
        command: buildHealthyServerCommand(port, toRemoteName('todo-plugin')),
        hasDeclaredUi: true,
        hasBuiltUi: true,
      });

      expect(result).toEqual({
        remoteEntryOverride: null,
        uiMode: 'built-fallback',
        error: expect.stringContaining('Refusing to use the local plugin UI dev server'),
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        unrelatedServer.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  it('returns unavailable when no live or built UI is usable', async () => {
    const sourcePath = await createTempSource();

    const result = await ensurePluginDevServer({
      appId: 'todo-plugin',
      sourcePath,
      declaredDevPort: undefined,
      command: null,
      hasDeclaredUi: true,
      hasBuiltUi: false,
    });

    expect(result).toEqual({
      remoteEntryOverride: null,
      uiMode: 'unavailable',
      error: `Local plugin UI dev server requires sero.app.devPort in package.json: ${sourcePath}`,
    });
  });

  it('returns backend-only for plugins without a UI surface', async () => {
    const sourcePath = await createTempSource();

    const result = await ensurePluginDevServer({
      appId: 'todo-plugin',
      sourcePath,
      declaredDevPort: undefined,
      command: null,
      hasDeclaredUi: false,
      hasBuiltUi: false,
    });

    expect(result).toEqual({
      remoteEntryOverride: null,
      uiMode: 'backend-only',
      error: null,
    });
  });
});
