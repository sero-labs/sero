import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { createTempSeroHome, type TempSeroHome } from './helpers/seroHome';

interface RunCliResult {
  stdout: string;
  exit: number;
}

interface CliContractResult {
  commandNames: string[];
  help: RunCliResult;
  workspaceHelp: RunCliResult;
  unknownCommand: RunCliResult;
  unknownWorkspaceAction: RunCliResult;
  workspaceInfo: RunCliResult;
  workspaceList: RunCliResult;
  sessionInfo: RunCliResult;
  createdWorkspace: RunCliResult;
  createdWorkspaceRecord: {
    id: string;
    name: string;
    path: string;
    runtime: { backend: string };
  } | null;
  editorRead: RunCliResult;
  editorList: RunCliResult;
  vcsStatus: RunCliResult;
  workspaceId: string;
  workspacePath: string;
  workspaceParent: string;
}

let home: TempSeroHome;
let result: CliContractResult;

function runnerSource(): string {
  return `
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { test, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] },
}));

import * as cli from '../../../electron/cli';

const { getCliRegistry, resetCliRegistryForTests } = cli;
import type { CliCommandContext } from '../../../electron/cli/core/types';
import { installCliSessionBridge } from '../../../electron/cli/bridges/session-bridge';
import * as sharedInfra from '../../../electron/shared/infra/shared-infra';

const { workspaceManager, containerManager } = sharedInfra;
import * as cliHelper from '../cli';

const { runCli } = cliHelper;

const workspaceParent = process.env.CLI_CONTRACT_WORKSPACE_PARENT;
if (!workspaceParent) throw new Error('CLI_CONTRACT_WORKSPACE_PARENT is required');

async function main() {
  await workspaceManager.init();
  const seeded = await workspaceManager.create('CLI Contract Seed', workspaceParent);
  const workspaceId = seeded.id;
  await workspaceManager.setRuntimeBackend(workspaceId, 'host');
  const workspacePath = seeded.path;
  fs.mkdirSync(path.join(workspacePath, 'notes'), { recursive: true });
  fs.writeFileSync(path.join(workspacePath, 'notes', 'contract.txt'), 'hello cli contract', 'utf8');
  execFileSync('git', ['init'], { cwd: workspacePath, stdio: 'ignore' });
  installCliSessionBridge({
    getSessionEntry: () => undefined,
    getActiveSessionForWorkspace: () => undefined,
    getActiveTurnId: () => null,
    noteTurnStart: () => undefined,
    noteTurnEnd: () => undefined,
    consumeTurnBudget: () => ({ allowed: true, count: 1, limit: 50 }),
    setSessionTitle: () => undefined,
  });

  function makeContext(): CliCommandContext {
    return {
      workspaceId,
      cwd: workspacePath,
      invocation: {
        workspaceId,
        sessionId: null,
        turnId: null,
        source: 'bash',
      },
      workspaceManager,
      containerManager,
    };
  }

  async function run(args: string[]) {
    const output = await runCli(getCliRegistry(), args, makeContext());
    resetCliRegistryForTests();
    return output;
  }

  let createdWorkspaceRecord = null;
  try {
    const commandNames = getCliRegistry().list({ workspaceId, sessionId: null }).map((command) => command.name);
    resetCliRegistryForTests();

    const help = await run(['help']);
    const workspaceHelp = await run(['help', 'workspace']);
    const unknownCommand = await run(['not-a-real-command']);
    const unknownWorkspaceAction = await run(['workspace', 'not-a-real-action']);
    const workspaceInfo = await run(['workspace', 'info']);
    const workspaceList = await run(['workspace', 'list']);
    const sessionInfo = await run(['session', 'info']);
    const createdWorkspace = await run(['workspace', 'create', 'CLI Created Workspace', '--parent', workspaceParent]);

    createdWorkspaceRecord = (await workspaceManager.list()).find(
      (workspace) => workspace.name === 'CLI Created Workspace',
    ) ?? null;
    if (createdWorkspaceRecord) {
      await workspaceManager.setRuntimeBackend(createdWorkspaceRecord.id, 'host');
      createdWorkspaceRecord = (await workspaceManager.list()).find(
        (workspace) => workspace.id === createdWorkspaceRecord.id,
      ) ?? createdWorkspaceRecord;
    }

    const editorRead = await run(['editor', 'read', 'notes/contract.txt']);
    const editorList = await run(['editor', 'list', 'notes']);
    const vcsStatus = await run(['vcs', 'status']);

    console.log('__CLI_CONTRACT_RESULT__' + JSON.stringify({
      commandNames,
      help,
      workspaceHelp,
      unknownCommand,
      unknownWorkspaceAction,
      workspaceInfo,
      workspaceList,
      sessionInfo,
      createdWorkspace,
      createdWorkspaceRecord,
      editorRead,
      editorList,
      vcsStatus,
      workspaceId,
      workspacePath,
      workspaceParent,
    }));
  } finally {
    if (createdWorkspaceRecord) await workspaceManager.remove(createdWorkspaceRecord.id);
    await workspaceManager.remove(workspaceId);
  }
}

test('cli contract runner', async () => {
  await main();
}, 30_000);
`;
}

function pnpmCommand(): string {
  return process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
}

function runCliContract(): CliContractResult {
  const workspaceParent = path.join(home.path, 'cli contract workspaces');
  fs.mkdirSync(workspaceParent, { recursive: true });

  const runnerPath = path.join(process.cwd(), 'e2e', 'helpers', '__tests__', '.cli-contract-runner.tmp.test.ts');
  fs.writeFileSync(runnerPath, runnerSource(), 'utf8');

  try {
    const stdout = execFileSync(pnpmCommand(), ['exec', 'vitest', 'run', runnerPath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SERO_HOME_OVERRIDE: home.path,
        SERO_HOME: home.path,
        PI_CODING_AGENT_DIR: path.join(home.path, 'agent'),
        HOME: home.path,
        USERPROFILE: home.path,
        CLI_CONTRACT_WORKSPACE_PARENT: workspaceParent,
      },
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10,
    });
    const line = stdout.split('\n').find((entry) => entry.includes('__CLI_CONTRACT_RESULT__'));
    if (!line) throw new Error(`CLI contract runner did not emit a result. Output:\n${stdout}`);
    return JSON.parse(line.slice(line.indexOf('__CLI_CONTRACT_RESULT__') + '__CLI_CONTRACT_RESULT__'.length)) as CliContractResult;
  } finally {
    fs.rmSync(runnerPath, { force: true });
  }
}

test.beforeAll(() => {
  home = createTempSeroHome();
  result = runCliContract();
});

test.afterAll(() => {
  home.cleanup();
});

test.describe('CLI registry contracts', () => {
  test('registers expected core commands', () => {
    expect(result.commandNames).toEqual(expect.arrayContaining([
      'help',
      'workspace',
      'session',
      'vcs',
      'editor',
      'terminal',
      'browser',
      'devserver',
      'app',
      'appstate',
      'artifacts',
    ]));
  });

  test('prints help for the registered command set and command-specific usage', () => {
    expect(result.help.exit).toBe(0);
    expect(result.help.stdout).toContain('Sero CLI');
    expect(result.help.stdout).toContain('workspace');
    expect(result.help.stdout).toContain('editor');
    expect(result.workspaceHelp.exit).toBe(0);
    expect(result.workspaceHelp.stdout).toContain('Usage: sero workspace');
    expect(result.workspaceHelp.stdout).toContain('create <name>');
  });

  test('returns production usage errors for invalid argv', () => {
    expect(result.unknownCommand.exit).toBe(1);
    expect(result.unknownCommand.stdout).toContain('ERROR: Unknown command');
    expect(result.unknownWorkspaceAction.exit).toBe(1);
    expect(result.unknownWorkspaceAction.stdout).toContain('ERROR: Unknown workspace action');
  });

  test('executes workspace and session commands against a seeded workspace', () => {
    expect(result.workspaceInfo.exit).toBe(0);
    expect(result.workspaceInfo.stdout).toContain(`Workspace: CLI Contract Seed (${result.workspaceId})`);
    expect(result.workspaceInfo.stdout).toContain(`Path: ${result.workspacePath}`);
    expect(result.workspaceInfo.stdout).toContain('Runtime backend: host');
    expect(result.workspaceList.exit).toBe(0);
    expect(result.workspaceList.stdout).toContain('CLI Contract Seed');
    expect(result.sessionInfo.exit).toBe(0);
    expect(result.sessionInfo.stdout).toContain(`Workspace: ${result.workspaceId}`);
    expect(result.sessionInfo.stdout).toContain('No active agent session.');
  });

  test('creates a workspace through the production CLI registry', () => {
    expect(result.createdWorkspace.exit).toBe(0);
    expect(result.createdWorkspace.stdout).toContain('Created workspace: CLI Created Workspace');
    expect(result.createdWorkspaceRecord).toEqual(expect.objectContaining({
      id: expect.any(String),
      path: expect.stringContaining(result.workspaceParent),
      runtime: expect.objectContaining({ backend: 'host' }),
    }));
  });

  test('executes editor read/list commands against a real host workspace', () => {
    expect(result.editorRead.exit).toBe(0);
    expect(result.editorRead.stdout).toBe('hello cli contract');
    expect(result.editorList.exit).toBe(0);
    expect(result.editorList.stdout).toContain('contract.txt');
  });

  test('executes VCS status against a real host workspace', () => {
    expect(result.vcsStatus.exit).toBe(0);
    expect(result.vcsStatus.stdout).toEqual(expect.any(String));
    expect(result.vcsStatus.stdout.length).toBeGreaterThan(0);
  });

  test.skip('plugin-bridged custom tools surface as CLI commands when policy allows — Phase 3 synthetic plugin fixture required', async () => {
    // Pending by design: Phase 3 creates a synthetic e2e plugin fixture and bridge-policy assertions.
  });
});
