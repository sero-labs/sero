import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { McpServerManager } from '../manager/server-manager';

const FIXTURE_DIR = path.resolve(import.meta.dirname, '../../../../apps/desktop/e2e/fixtures/test-mcp-server');
const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

function createManager() {
  const manager = new McpServerManager();
  cleanups.push(() => manager.closeAll());
  return manager;
}

async function startHttpFixture(): Promise<string> {
  const child: ChildProcess = spawn(process.execPath, [path.join(FIXTURE_DIR, 'server.mts'), '--http'], { stdio: ['ignore', 'pipe', 'inherit'] });
  cleanups.push(() => { child.kill(); });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.stdout?.once('data', (chunk: Buffer) => resolve(chunk.toString().trim()));
  });
}

describe('MCP server manager against the e2e fixture', () => {
  it('negotiates 2026-07-28 with the stdio fixture', async () => {
    const connection = await createManager().connect('stdio', {
      transport: 'stdio',
      command: process.execPath,
      args: [path.join(FIXTURE_DIR, 'server.mts')],
    });

    expect(connection.status).toBe('connected');
    expect(connection.protocol).toMatchObject({ era: 'modern', version: '2026-07-28' });
    expect(connection.tools.map((tool) => tool.name)).toContain('echo');
  });

  it('negotiates 2026-07-28 with the HTTP fixture', async () => {
    const url = await startHttpFixture();
    const manager = createManager();
    const connection = await manager.connect('http', { transport: 'http', url });

    expect(connection.status).toBe('connected');
    expect(connection.protocol).toMatchObject({ era: 'modern', version: '2026-07-28', deprecatedTransport: false });
    const result = await manager.callTool('http', 'echo', { message: 'hi' });
    expect(result.content).toEqual([{ type: 'text', text: 'echo: hi' }]);
  });

  it('falls back to the legacy era with the --legacy fixture', async () => {
    const connection = await createManager().connect('legacy', {
      transport: 'stdio',
      command: process.execPath,
      args: [path.join(FIXTURE_DIR, 'server.mts'), '--legacy'],
    });

    expect(connection.status).toBe('connected');
    expect(connection.protocol?.era).toBe('legacy');
    expect(connection.tools.map((tool) => tool.name)).toContain('echo');
  });

  it.each([
    ['modern', []],
    ['legacy', ['--legacy']],
  ])('lists tools again after the %s fixture reports a change', async (_era, extraArgs) => {
    const changed: string[][] = [];
    const manager = new McpServerManager({
      onInventoryChanged: (_name, connection) => changed.push(connection.tools.map((tool) => tool.name)),
    });
    cleanups.push(() => manager.closeAll());
    await manager.connect('fixture', {
      transport: 'stdio',
      command: process.execPath,
      args: [path.join(FIXTURE_DIR, 'server.mts'), ...extraArgs],
    });

    await manager.callTool('fixture', 'reveal_tool', {});

    await expect.poll(() => changed.at(-1) ?? [], { timeout: 5_000 }).toContain('hidden_tool');
    expect(manager.getConnection('fixture')?.tools.map((tool) => tool.name)).toContain('hidden_tool');
  });
});
