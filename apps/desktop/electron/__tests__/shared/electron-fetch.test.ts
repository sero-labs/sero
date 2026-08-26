import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { afterEach, describe, expect, it } from 'vitest';

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  while (cleanups.length > 0) await cleanups.pop()?.();
});

async function startDelayedBodyServer(): Promise<string> {
  const server = createServer((request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.write('start');
    setTimeout(() => response.end('end'), request.url === '/stall' ? 1500 : 100);
  });
  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Test server did not bind');
  cleanups.push(() => new Promise<void>((resolveClose) => server.close(() => resolveClose())));
  return `http://127.0.0.1:${address.port}`;
}

async function runElectronProbe(baseUrl: string): Promise<Record<string, unknown>> {
  const root = await mkdtemp(join(tmpdir(), 'sero-electron-idle-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  const modulePath = resolve('electron/shared/infra/electron-fetch.ts');
  const entryPath = join(root, 'probe.ts');
  const scriptPath = join(root, 'probe.cjs');
  await writeFile(entryPath, `
    import { app } from 'electron';
    import { configureElectronFetch } from ${JSON.stringify(modulePath)};
    app.whenReady().then(async () => {
      app.dock?.hide();
      const result = {};
      configureElectronFetch(100);
      try {
        const response = await fetch(process.env.SERO_IDLE_TEST_URL + '/stall');
        await response.text();
        result.stalled = 'completed';
      } catch (error) {
        result.stalled = error?.cause?.code;
      }
      configureElectronFetch(0);
      const response = await fetch(process.env.SERO_IDLE_TEST_URL + '/disabled');
      result.disabled = await response.text();
      console.log('SERO_IDLE_RESULT=' + JSON.stringify(result));
      app.exit(0);
    });
  `, 'utf8');
  await build({
    entryPoints: [entryPath],
    outfile: scriptPath,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron'],
    logLevel: 'silent',
  });

  const load = process.getBuiltinModule('node:module')?.createRequire(join(process.cwd(), 'package.json'));
  if (!load) throw new Error('Node module loader is unavailable');
  const electronPath = load('electron');
  if (typeof electronPath !== 'string') throw new Error('Electron executable path is unavailable');

  const output = await new Promise<string>((resolveOutput, rejectOutput) => {
    const child = spawn(electronPath, [scriptPath], {
      env: {
        ...process.env,
        SERO_IDLE_TEST_URL: baseUrl,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      rejectOutput(new Error(`Electron probe timed out: ${stderr}`));
    }, 10000);
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', rejectOutput);
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolveOutput(stdout);
      else rejectOutput(new Error(`Electron probe exited ${code}: ${stderr}`));
    });
  });
  const resultLine = output.split('\n').find((line) => line.startsWith('SERO_IDLE_RESULT='));
  if (!resultLine) throw new Error(`Electron probe returned no result: ${output}`);
  return JSON.parse(resultLine.slice('SERO_IDLE_RESULT='.length)) as Record<string, unknown>;
}

describe('Electron fetch', () => {
  it('applies the setting to stalled Electron fetch bodies and supports zero', async () => {
    const baseUrl = await startDelayedBodyServer();

    await expect(runElectronProbe(baseUrl)).resolves.toEqual({
      stalled: 'UND_ERR_BODY_TIMEOUT',
      disabled: 'startend',
    });
  }, 20000);
});
