import { isAbsolute, relative, sep } from 'node:path';
import type { DeliveryReceipt } from '../../shared/delivery-types';
import type { Loop } from '../../shared/types';
import type { OrchestratorHost } from '../host';

export type VerifyResult = { ok: true } | { ok: false; status: 'unknown' | 'mismatch'; reason: string };

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Runs where the agent worked, including inside remote/container workspaces. */
export async function observeReceipt(host: OrchestratorHost, loop: Loop, receipt: DeliveryReceipt): Promise<VerifyResult> {
  const destination = receipt.destination === 'pr' ? 'pr' : 'saved-artifact';
  const tools = await (host.prepareReceiptObservation?.(destination) ?? Promise.resolve({ node: 'node', git: 'git', gh: 'gh' })).catch(() => undefined);
  if (!tools) return { ok: false, status: 'unknown', reason: 'Delivery observation tools could not be prepared. Retry verification after toolchain access is restored.' };
  const cwd = loop.runtime.workspace.resolved?.cwd ?? host.workspacePath;
  const script = receipt.destination === 'pr' ? PR_OBSERVATION : FILE_OBSERVATION;
  const name = loop.delivery?.params?.name;
  // runCommand starts at the selected runtime's workspace root. Absolute host
  // paths must not leak into a container's command arguments.
  const args = JSON.stringify({ tools, cwd: relative(host.workspacePath, cwd),
    ref: destination === 'saved-artifact' ? runtimeRef(host.workspacePath, cwd, receipt.ref) : receipt.ref,
    revision: receipt.revision, name: typeof name === 'string' ? runtimeRef(host.workspacePath, cwd, name) : name,
    startedAt: loop.runs.find(run => run.id === receipt.runId)?.startedAt });
  const result = await host.runCommand(`${shellQuote(tools.node)} -e ${shellQuote(script)} ${shellQuote(args)}`).catch(() => undefined);
  if (!result || result.exitCode !== 0) return { ok: false, status: 'unknown', reason: 'Delivery observation is unavailable. Restore workspace/GitHub access, then retry verification.' };
  try {
    const value: unknown = JSON.parse(result.stdout);
    if (typeof value !== 'object' || value === null || !('ok' in value)) return { ok: false, status: 'unknown', reason: 'Delivery observation returned no usable evidence.' };
    if (value.ok === true) return { ok: true };
    if (value.ok === false && 'reason' in value && typeof value.reason === 'string') return { ok: false, status: 'mismatch', reason: value.reason };
  } catch { /* Invalid output is an unavailable observation, never proof. */ }
  return { ok: false, status: 'unknown', reason: 'Delivery observation returned no usable evidence.' };
}

function runtimeRef(workspaceRoot: string, cwd: string, ref: string): string {
  if (!isAbsolute(ref)) return ref;
  const withinHostRoot = relative(workspaceRoot, ref);
  if (withinHostRoot === '..' || withinHostRoot.startsWith(`..${sep}`) || isAbsolute(withinHostRoot)) return ref;
  return relative(cwd, ref);
}

// Keep all path and identity checks in the workspace that owns the bytes and Git checkout.
const FILE_OBSERVATION = `
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const a = JSON.parse(process.argv[1]);
a.cwd = require('node:path').resolve(process.cwd(), a.cwd);
const root = fs.realpathSync(a.cwd);
const target = path.resolve(root, a.ref);
let reason;
if (!fs.existsSync(target)) reason = 'The receipt artifact does not exist.';
else {
  const real = fs.realpathSync(target);
  const relative = path.relative(root, real);
  if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) reason = 'The receipt artifact is outside the intended workspace/worktree.';
  else if (a.name !== undefined && target !== path.resolve(root, String(a.name))) reason = 'The receipt does not name the declared artifact.';
  else if (!fs.statSync(real).isFile()) reason = 'The receipt does not name a file.';
  else if (fs.statSync(real).mtimeMs < Date.parse(a.startedAt)) reason = 'The artifact predates this invocation.';
  else if (crypto.createHash('sha256').update(fs.readFileSync(real)).digest('hex') !== a.revision) reason = 'The saved artifact differs from the delivered revision.';
}
process.stdout.write(JSON.stringify(reason ? {ok:false,reason} : {ok:true}));
`;

const PR_OBSERVATION = `
const {execFileSync} = require('node:child_process');
const a = JSON.parse(process.argv[1]);
a.cwd = require('node:path').resolve(process.cwd(), a.cwd);
const read = (command, args) => execFileSync(a.tools[command], args, {cwd:a.cwd, encoding:'utf8', stdio:['ignore','pipe','pipe']}).trim();
const identity = (value) => {
  const u = new URL(value);
  const m = /^\\/([^/]+)\\/([^/]+)\\/pull\\/(\\d+)\\/?$/.exec(u.pathname);
  if (u.protocol !== 'https:' || u.username || u.password || !m) return null;
  return [u.host.toLowerCase().replace(/^www\\.github\\.com$/, 'github.com'), m[1].toLowerCase(), m[2].toLowerCase(), Number(m[3])];
};
const ref = identity(a.ref);
let reason;
if (!ref) reason = 'The receipt is not a full pull request URL.';
else {
  const repo = JSON.parse(read('gh', ['repo','view','--json','url']));
  const u = new URL(repo.url);
  const expected = [u.host.toLowerCase(), ...u.pathname.split('/').filter(Boolean).map(s => s.toLowerCase())];
  if (JSON.stringify(ref.slice(0,3)) !== JSON.stringify(expected)) reason = 'The receipt pull request belongs to another repository.';
  else {
    const pr = JSON.parse(read('gh', ['pr','view',String(ref[3]),'--json','url,headRefOid,state']));
    const head = read('git', ['rev-parse','HEAD']);
    if (JSON.stringify(identity(pr.url)) !== JSON.stringify(ref)) reason = 'The observed pull request identity differs from the receipt.';
    else if (pr.state !== 'OPEN') reason = 'The receipt pull request is not open.';
    else if (pr.headRefOid !== a.revision || head !== a.revision) reason = 'The pull request does not contain the delivered workspace revision.';
  }
}
process.stdout.write(JSON.stringify(reason ? {ok:false,reason} : {ok:true}));
`;
