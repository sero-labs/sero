/**
 * Local stand-ins for outside systems: a web page server and a bare git
 * repository as the push and pull remote.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import type { ToolCheckApp } from './app';
import type { ToolCheckFixtures } from './types';

const PAGES_DIR = path.resolve(__dirname, '../../fixtures/tool-check-pages');

export interface RunningFixtures {
  values: ToolCheckFixtures;
  close(): Promise<void>;
}

function startPageServer(address: string): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const name = path.basename(new URL(req.url ?? '/', 'http://localhost').pathname) || 'index.html';
    const file = path.join(PAGES_DIR, name.includes('.') ? name : `${name}.html`);
    if (!file.startsWith(PAGES_DIR) || !fs.existsSync(file)) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(fs.readFileSync(file));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, address, () => resolve(server));
  });
}

/** Where the Mac or Linux host is reachable from a workspace container, and from the host itself. */
function hostAddress(runtime: ToolCheckApp['runtime']): string {
  // Apple Container's default network; the app already keeps it off the proxy (NO_PROXY).
  if (runtime === 'apple-container') return '192.168.64.1';
  if (runtime === 'docker') {
    return execFileSync('docker', ['network', 'inspect', 'bridge', '--format', '{{(index .IPAM.Config 0).Gateway}}'], { encoding: 'utf8' }).trim();
  }
  return '127.0.0.1';
}

/** A container mounts the workspace here, not at its host path. */
const CONTAINER_WORKSPACE = '/workspace';
const REMOTE_DIR = '.tc-remote.git';

export async function startFixtures(check: ToolCheckApp): Promise<RunningFixtures> {
  const address = hostAddress(check.runtime);
  const pages = await startPageServer(address);
  const { port } = pages.address() as AddressInfo;
  // Inside the workspace, the one host folder a container sees. The workspace ignores it.
  const remote = path.join(check.workspaceDir, REMOTE_DIR);
  execFileSync('git', ['init', '--bare', '-b', 'main', remote], { stdio: 'ignore' });
  const runtimeRemote = check.runtime === 'host' ? remote : `${CONTAINER_WORKSPACE}/${REMOTE_DIR}`;
  return {
    values: { pageServerUrl: `http://${address}:${port}`, gitRemotePath: runtimeRemote, gitRemoteHostPath: remote },
    close: async () => {
      pages.closeAllConnections();
      await new Promise<void>((resolve) => pages.close(() => resolve()));
      fs.rmSync(remote, { recursive: true, force: true });
    },
  };
}
