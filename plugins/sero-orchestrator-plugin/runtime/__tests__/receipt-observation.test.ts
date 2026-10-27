import { afterEach, describe, expect, it } from 'vitest';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm, symlink, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyReceipt } from '../delivery/verify-receipt';
import { createFakeHost } from './fake-host';
import { oneStepPlan, seedActiveLoop } from './fixtures';
import type { DeliveryReceipt } from '../../shared/delivery-types';

const execute = promisify(exec);
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

async function setup(destination: 'pr' | 'saved-artifact' = 'saved-artifact', hostRoot?: string) {
  const root = await mkdtemp(join(tmpdir(), 'sero-receipt-'));
  directories.push(root);
  const cwd = join(root, 'workspace');
  const bin = join(root, 'bin');
  await mkdir(cwd);
  await mkdir(bin);
  const host = createFakeHost({ workspacePath: hostRoot ?? cwd });
  const loop = seedActiveLoop(host, oneStepPlan().plan);
  loop.delivery = { destination };
  loop.runtime.activeRunId = 'run-current';
  loop.runs = [{ id: 'run-current', runNumber: 1, status: 'running', startedStepIds: [], stepAttempts: [], recoveryDecisions: [], observations: [], startedAt: '2026-01-01T00:00:00Z' }];
  const receipt: DeliveryReceipt = { destination, ref: 'report.md', summary: 'report', deliveredAt: '2026-01-01T00:00:01Z', runId: 'run-current', planRevision: 0, revision: createHash('sha256').update('current report').digest('hex') };
  await writeFile(join(cwd, 'report.md'), 'current report');
  host.runCommand = async command => {
    try {
      const { stdout, stderr } = await execute(command, { cwd, env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
      return { stdout, stderr, exitCode: 0 };
    } catch { return { stdout: '', stderr: '', exitCode: 1 }; }
  };
  return { root, cwd, bin, host, loop, receipt };
}

describe('receipt observations', () => {
  it('verifies real file bytes in the intended worktree and rejects another artifact, changed bytes, old files and escaping symlinks', async () => {
    const { root, cwd, host, loop, receipt } = await setup();
    expect(await verifyReceipt(host, loop, receipt)).toEqual({ ok: true });
    loop.delivery = { destination: 'saved-artifact', params: { name: 'intended.md' } };
    expect(await verifyReceipt(host, loop, receipt)).toMatchObject({ ok: false, status: 'mismatch' });
    loop.delivery = { destination: 'saved-artifact' };
    await writeFile(join(cwd, 'report.md'), 'different report');
    expect(await verifyReceipt(host, loop, receipt)).toMatchObject({ ok: false, status: 'mismatch' });
    await writeFile(join(cwd, 'report.md'), 'current report');
    await utimes(join(cwd, 'report.md'), new Date('2020-01-01'), new Date('2020-01-01'));
    expect(await verifyReceipt(host, loop, receipt)).toMatchObject({ ok: false, status: 'mismatch' });
    await writeFile(join(root, 'outside.md'), 'current report');
    await symlink(join(root, 'outside.md'), join(cwd, 'link.md'));
    expect(await verifyReceipt(host, loop, { ...receipt, ref: 'link.md' })).toMatchObject({ ok: false, status: 'mismatch' });
  });

  it('uses provisioned Node without PATH and maps Host worktree paths into the selected runtime', async () => {
    const { cwd, host, loop, receipt } = await setup('saved-artifact', '/host/checkout');
    await mkdir(join(cwd, 'worktree'));
    await writeFile(join(cwd, 'worktree', 'report.md'), 'current report');
    loop.runtime.workspace.resolved = { id: 'worktree', type: 'managed-worktree', workspaceRoot: '/host/checkout',
      cwd: '/host/checkout/worktree', worktreePath: '/host/checkout/worktree', branchName: 'delivery', resolvedBy: 'create-option', createdAt: 't' };
    host.prepareReceiptObservation = async () => ({ node: process.execPath, git: 'git', gh: 'gh' });
    host.runCommand = async command => {
      const { stdout, stderr } = await execute(command, { cwd, env: { ...process.env, PATH: '' } });
      return { stdout, stderr, exitCode: 0 };
    };
    expect(await verifyReceipt(host, loop, { ...receipt, ref: '/host/checkout/worktree/report.md' })).toEqual({ ok: true });
    expect(await verifyReceipt(host, loop, { ...receipt, ref: join(cwd, 'worktree', 'report.md') })).toEqual({ ok: true });
  });

  it('retains unknown for unavailable observation and legacy evidence, and rejects a stale invocation or plan', async () => {
    const { host, loop, receipt } = await setup();
    host.runCommand = async () => { throw new Error('offline'); };
    expect(await verifyReceipt(host, loop, receipt)).toMatchObject({ ok: false, status: 'unknown' });
    expect(await verifyReceipt(host, loop, { ...receipt, runId: undefined })).toMatchObject({ ok: false, status: 'unknown' });
    expect(await verifyReceipt(host, loop, { ...receipt, runId: 'old-run' })).toMatchObject({ ok: false, status: 'mismatch' });
    expect(await verifyReceipt(host, loop, { ...receipt, planRevision: 9 })).toMatchObject({ ok: false, status: 'mismatch' });
  });

  it('binds full PR repository, identity and delivered revision using read-only GitHub observations', async () => {
    const { bin, host, loop, receipt } = await setup('pr');
    const sha = 'a'.repeat(40);
    receipt.ref = 'https://github.com/owner/repo/pull/7';
    receipt.revision = sha;
    await writeFile(join(bin, 'git'), `#!/bin/sh\nprintf '%s' '${sha}'\n`, { mode: 0o755 });
    const gh = async (url: string, headRefOid: string) => writeFile(join(bin, 'gh'), `#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(process.argv[2] === 'repo' ? {url:'https://github.com/owner/repo'} : ${JSON.stringify({ url, headRefOid, state: 'OPEN' })}));\n`, { mode: 0o755 });
    await gh(receipt.ref, sha);
    expect(await verifyReceipt(host, loop, receipt)).toEqual({ ok: true });
    expect(await verifyReceipt(host, loop, { ...receipt, ref: 'https://github.com/other/repo/pull/7' })).toMatchObject({ ok: false, status: 'mismatch' });
    await gh('https://github.com/owner/repo/pull/8', sha);
    expect(await verifyReceipt(host, loop, receipt)).toMatchObject({ ok: false, status: 'mismatch' });
    await gh(receipt.ref, 'b'.repeat(40));
    expect(await verifyReceipt(host, loop, receipt)).toMatchObject({ ok: false, status: 'mismatch' });
    await rm(join(bin, 'gh'));
    host.runCommand = async () => ({ stdout: '', stderr: 'unavailable', exitCode: 127 });
    expect(await verifyReceipt(host, loop, receipt)).toMatchObject({ ok: false, status: 'unknown' });
  });
});
