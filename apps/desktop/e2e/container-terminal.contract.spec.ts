import { test, expect, type ElectronApplication, type Page } from '@playwright/test';
import { closeSeroApp, launchSeroApp } from './helpers/electron-app';
import { createTempSeroHome, type TempSeroHome } from './helpers/seroHome';

let home: TempSeroHome;
let app: ElectronApplication;
let page: Page;

const containerStates = ['running', 'stopped', 'unknown'];

interface ContainerErrorResult {
  ok: false;
  message: string;
}

interface ContainerInspectResult {
  ok: true;
  value: unknown;
}

function expectContainerInfoShape(value: unknown): void {
  expect(value).toEqual(expect.objectContaining({
    id: expect.any(String),
    image: expect.any(String),
    state: expect.any(String),
    cpus: expect.any(Number),
    memoryBytes: expect.any(Number),
  }));

  const info = value as { state: string; ipAddress?: string };
  expect(containerStates).toContain(info.state);
  if (info.ipAddress) expect(typeof info.ipAddress).toBe('string');
}

test.beforeAll(async () => {
  home = createTempSeroHome();
  ({ app, page } = await launchSeroApp({
    seroHome: home.path,
    runtime: 'host',
    env: { HOME: home.path, USERPROFILE: home.path, SERO_HOST_FIRST: '1' },
  }));
});

test.afterAll(async () => {
  try {
    await closeSeroApp(app);
  } finally {
    home.cleanup();
  }
});

test.describe('container and terminal IPC contracts', () => {
  test('exposes container and terminal bridge methods', async () => {
    const surface = await page.evaluate(() => ({
      container: {
        status: typeof window.sero.container.status,
        inspect: typeof window.sero.container.inspect,
        ensure: typeof window.sero.container.ensure,
      },
      terminal: {
        create: typeof window.sero.terminal.create,
        write: typeof window.sero.terminal.write,
        resize: typeof window.sero.terminal.resize,
        replay: typeof window.sero.terminal.replay,
        dispose: typeof window.sero.terminal.dispose,
        onData: typeof window.sero.terminal.onData,
        onExit: typeof window.sero.terminal.onExit,
      },
    }));

    expect(surface.container).toEqual({ status: 'function', inspect: 'function', ensure: 'function' });
    expect(surface.terminal).toEqual({
      create: 'function',
      write: 'function',
      resize: 'function',
      replay: 'function',
      dispose: 'function',
      onData: 'function',
      onExit: 'function',
    });
  });

  test('returns safe container null and error contracts for a host workspace', async () => {
    const result = await page.evaluate(async () => {
      const workspace = await window.sero.workspace.create('Container Contract');
      try {
        const status = await window.sero.container.status(workspace.id);
        const ensured = await window.sero.container.ensure(workspace.id);
        let inspect: ContainerInspectResult | ContainerErrorResult;
        try {
          inspect = { ok: true, value: await window.sero.container.inspect(workspace.id) };
        } catch (error) {
          inspect = { ok: false, message: error instanceof Error ? error.message : String(error) };
        }
        return { workspaceId: workspace.id, status, ensured, inspect };
      } finally {
        await window.sero.workspace.remove(workspace.id);
      }
    });

    expect(result.workspaceId).toEqual(expect.any(String));
    expect(result.status).toBeNull();
    expect(result.ensured).toBeNull();

    if (result.inspect.ok) {
      expectContainerInfoShape(result.inspect.value);
    } else {
      expect(result.inspect.message).toEqual(expect.stringContaining('Container inspect'));
      expect(result.inspect.message).toEqual(expect.stringContaining('host'));
    }
  });

  test('creates, writes, resizes, replays, and disposes a terminal session', async () => {
    const marker = `SERO_TERMINAL_CONTRACT_${Date.now()}`;
    const result = await page.evaluate(async (markerText) => {
      const workspace = await window.sero.workspace.create('Terminal Contract');
      const terminalId = `contract-${Date.now()}`;
      let terminalCreated = false;
      let unsubscribe = (): void => {};
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const chunks: string[] = [];

      try {
        const markerSeen = new Promise<boolean>((resolve) => {
          timeout = setTimeout(() => resolve(false), 15_000);
          unsubscribe = window.sero.terminal.onData((id, data) => {
            if (id !== terminalId) return;
            chunks.push(data);
            if (chunks.join('').includes(markerText)) resolve(true);
          });
        });

        const created = await window.sero.terminal.create(workspace.id, terminalId, 80, 24);
        terminalCreated = true;
        await window.sero.terminal.resize(terminalId, 100, 30);
        await window.sero.terminal.write(terminalId, `echo ${markerText}\r`);
        const markerObserved = await markerSeen;
        const replay = await window.sero.terminal.replay(terminalId);

        return {
          created,
          markerObserved,
          outputIncludesMarker: chunks.join('').includes(markerText),
          replayType: typeof replay,
          replayIncludesMarker: replay.includes(markerText),
        };
      } finally {
        if (timeout) clearTimeout(timeout);
        unsubscribe();
        if (terminalCreated) await window.sero.terminal.dispose(terminalId);
        await window.sero.workspace.remove(workspace.id);
      }
    }, marker);

    expect(result.created).toEqual(expect.objectContaining({ runtime: expect.any(String) }));
    expect(['host', 'container']).toContain(result.created.runtime);
    expect(result.replayType).toBe('string');
    expect(result.markerObserved || result.outputIncludesMarker || result.replayIncludesMarker).toBe(true);
  });
});
