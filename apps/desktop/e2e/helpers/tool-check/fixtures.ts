/**
 * Local stand-ins for outside systems: a web page server and a bare git
 * repository as the push and pull remote.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import type { ToolCheckApp } from './app';
import type { ToolCheckFixtures } from './types';

const PAGES_DIR = path.resolve(__dirname, '../../fixtures/tool-check-pages');

export interface RunningFixtures {
  values: ToolCheckFixtures;
  close(): Promise<void>;
}

function startPageServer(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const name = path.basename(new URL(req.url ?? '/', 'http://localhost').pathname) || 'index.html';
    const file = path.join(PAGES_DIR, name.includes('.') ? name : `${name}.html`);
    if (!file.startsWith(PAGES_DIR) || !fs.existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(fs.readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

export async function startFixtures(check: ToolCheckApp): Promise<RunningFixtures> {
  const pages = await startPageServer();
  const { port } = pages.address() as AddressInfo;
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-tool-check-remote-'));
  execFileSync('git', ['init', '--bare', '-b', 'main', remote], { stdio: 'ignore' });
  if (check.runtime !== 'host') {
    throw new Error(`fixtures for the ${check.runtime} runtime are not built yet`);
  }
  return {
    values: { pageServerUrl: `http://127.0.0.1:${port}`, gitRemotePath: remote },
    close: async () => {
      pages.closeAllConnections();
      await new Promise<void>((resolve) => pages.close(() => resolve()));
      fs.rmSync(remote, { recursive: true, force: true });
    },
  };
}
