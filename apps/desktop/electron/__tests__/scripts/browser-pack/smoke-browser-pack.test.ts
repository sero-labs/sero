import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import runtimePins from '../../../../runtime-tools/pins.json';

const execFileAsync = promisify(execFile);
const scriptPath = path.join(process.cwd(), 'scripts/browser-pack/smoke-browser-pack.mjs');
const chromiumRoot = `chromium-${runtimePins.browser.chromiumRevision}`;

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sero-browser-pack-smoke-'));
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('smoke-browser-pack', () => {
  it('passes when POSIX shims point at an executable package bin', async () => {
    await createLinuxPack({ includePackageBin: true, executablePackageBin: true });

    const result = await runSmoke(['--pack-root', tempRoot, '--platform', 'linux', '--arch', 'x64']);

    expect(result.stdout).toContain('agent-browser shim: agent-browser/bin/agent-browser');
    expect(result.stdout).toContain('Browser pack smoke passed for browser-linux-x64');
  });

  it('accepts the current Linux x64 Chromium archive layout', async () => {
    await createLinuxPack({
      chromiumPath: `${chromiumRoot}/chrome-linux64/chrome`,
      includePackageBin: true,
      executablePackageBin: true,
    });

    const result = await runSmoke(['--pack-root', tempRoot, '--platform', 'linux', '--arch', 'x64']);

    expect(result.stdout).toContain(`Chromium: ${chromiumRoot}/chrome-linux64/chrome`);
    expect(result.stdout).toContain('Browser pack smoke passed for browser-linux-x64');
  });

  it('fails when an agent-browser shim points at a missing package bin', async () => {
    await createLinuxPack({ includePackageBin: false, executablePackageBin: false });

    await expect(runSmoke(['--pack-root', tempRoot, '--platform', 'linux', '--arch', 'x64']))
      .rejects.toMatchObject({ stderr: expect.stringContaining('agent-browser shim target is missing') });
  });

  it('fails when POSIX agent-browser shims or package bins are not executable', async () => {
    await createLinuxPack({ includePackageBin: true, executablePackageBin: false });

    await expect(runSmoke(['--pack-root', tempRoot, '--platform', 'linux', '--arch', 'x64']))
      .rejects.toMatchObject({ stderr: expect.stringContaining('agent-browser shim target is not executable') });
  });

  it('statically validates Windows shim extension and package-bin target', async () => {
    await createWindowsPack({ candidate: 'agent-browser/bin/agent-browser.ps1' });

    await expect(runCustomShimValidation({ platform: 'win32', candidate: 'agent-browser/bin/agent-browser.ps1' }))
      .rejects.toMatchObject({ stderr: expect.stringContaining('agent-browser Windows shim must use an executable extension') });

    await createWindowsPack({ candidate: 'agent-browser/bin/agent-browser.cmd', clean: false });
    await fs.rm(path.join(tempRoot, 'agent-browser/node_modules/agent-browser/dist/cli.js'), { force: true });

    await expect(runSmoke(['--pack-root', tempRoot, '--platform', 'win32', '--arch', 'x64']))
      .rejects.toMatchObject({ stderr: expect.stringContaining('agent-browser shim target is missing') });
  });
});

async function runSmoke(args: string[]) {
  return execFileAsync('node', [scriptPath, ...args], { cwd: process.cwd(), encoding: 'utf8' });
}

async function runCustomShimValidation({ platform, candidate }: { platform: string; candidate: string }) {
  const moduleUrl = new URL(`file://${scriptPath}`).href;
  const source = `
    import { validateAgentBrowserShims } from ${JSON.stringify(moduleUrl)};
    await validateAgentBrowserShims({
      packRoot: ${JSON.stringify(tempRoot)},
      artifact: { platform: ${JSON.stringify(platform)}, agentBrowserCandidates: [${JSON.stringify(candidate)}] },
      log: () => undefined,
    });
  `;
  return execFileAsync('node', ['--input-type=module', '-e', source], { cwd: process.cwd(), encoding: 'utf8' });
}

async function createLinuxPack({
  chromiumPath = `${chromiumRoot}/chrome-linux/chrome`,
  includePackageBin,
  executablePackageBin,
}: {
  chromiumPath?: string;
  includePackageBin: boolean;
  executablePackageBin: boolean;
}) {
  await writeExecutable(chromiumPath, '#!/bin/sh\n');
  await writeExecutable('ffmpeg-1011/ffmpeg-linux', '#!/bin/sh\n');
  await writeExecutable(
    'agent-browser/bin/agent-browser',
    '#!/usr/bin/env sh\nexec node "$(dirname "$0")/../node_modules/agent-browser/cli.js" "$@"\n',
  );
  if (includePackageBin) {
    await writeFile('agent-browser/node_modules/agent-browser/cli.js', '#!/usr/bin/env node\n', executablePackageBin ? 0o755 : 0o644);
  }
}

async function createWindowsPack({ candidate, clean = true }: { candidate: string; clean?: boolean }) {
  if (clean) await fs.rm(tempRoot, { recursive: true, force: true });
  await writeFile(`${chromiumRoot}/chrome-win/chrome.exe`, '', 0o644);
  await writeFile('ffmpeg-1011/ffmpeg-win64.exe', '', 0o644);
  await writeFile(candidate, '@echo off\r\nnode "%~dp0..\\node_modules\\agent-browser\\dist\\cli.js" %*\r\n', 0o644);
  await writeFile('agent-browser/node_modules/agent-browser/dist/cli.js', '', 0o644);
}

async function writeExecutable(relativePath: string, content: string) {
  await writeFile(relativePath, content, 0o755);
}

async function writeFile(relativePath: string, content: string, mode: number) {
  const filePath = path.join(tempRoot, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, { mode });
  await fs.chmod(filePath, mode);
}
