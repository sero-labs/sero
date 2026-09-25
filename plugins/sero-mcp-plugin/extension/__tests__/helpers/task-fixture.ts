import { spawn } from 'node:child_process';
import path from 'node:path';

export const FIXTURE_PATH = path.resolve(import.meta.dirname, '../../../../../apps/desktop/e2e/fixtures/test-mcp-server/server.mts');

/**
 * Starts the e2e fixture in HTTP mode, the mode that serves MCP Tasks. Returns
 * its MCP URL, a switch that takes the endpoint offline, and a stop function.
 */
export async function startTaskFixture() {
  const child = spawn(process.execPath, [FIXTURE_PATH, '--http'], { stdio: ['ignore', 'pipe', 'inherit'] });
  const url = await new Promise<string>((resolve, reject) => {
    child.once('error', reject);
    child.stdout?.once('data', (chunk: Buffer) => resolve(chunk.toString().trim()));
  });
  const admin = (state: 'offline' | 'online') => fetch(new URL(`/admin/${state}`, url), { method: 'POST' });
  return { url, setOffline: (offline: boolean) => admin(offline ? 'offline' : 'online'), stop: () => { child.kill(); } };
}
