/** The official OpenSpec CLI is an Architect-only, pinned package dependency. */
import path from 'node:path';
import { createRequire } from 'node:module';

import type { ArchitectHost } from './host';

const packageEntry = createRequire(import.meta.url).resolve('@fission-ai/openspec');
const cli = path.resolve(path.dirname(packageEntry), '..', 'bin', 'openspec.js');

/** Test hosts for ordinary Architect actions need not emulate the OpenSpec CLI. */
export function requireOpenSpecHost(host: Partial<Pick<ArchitectHost, 'exec'>>): Pick<ArchitectHost, 'exec'> {
  if (!host.exec) throw new Error('The OpenSpec CLI is unavailable in this Architect runtime.');
  return { exec: host.exec };
}

async function command(host: Pick<ArchitectHost, 'exec'>, folder: string, args: string[]): Promise<string> {
  const result = await host.exec('node', [cli, ...args], folder);
  if (result.exitCode !== 0) throw new Error(`OpenSpec ${args.join(' ')} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  return result.stdout;
}

/** Initialise only the OpenSpec data model. Sero supplies the agents and UI. */
export async function ensureOpenSpec(host: Pick<ArchitectHost, 'exec' | 'pathExists'>, folder: string): Promise<void> {
  if (await host.pathExists(path.join(folder, 'openspec', 'config.yaml'))) return;
  await command(host, folder, ['init', '--tools', 'none', '--no-animation']);
}

export async function newOpenSpecChange(host: Pick<ArchitectHost, 'exec'>, folder: string, name: string): Promise<void> {
  await command(host, folder, ['new', 'change', name]);
}

export async function validateOpenSpecChange(host: Pick<ArchitectHost, 'exec'>, folder: string, name: string): Promise<void> {
  const status = JSON.parse(await command(host, folder, ['status', '--change', name, '--json'])) as { isPlanningComplete?: boolean };
  if (status.isPlanningComplete !== true) throw new Error(`OpenSpec change ${name} needs its proposal, specs, design and tasks before implementation.`);
  await command(host, folder, ['validate', name, '--type', 'change', '--strict', '--no-interactive']);
}

export async function openSpecInstructions(host: Pick<ArchitectHost, 'exec'>, folder: string, name: string, artifact: string): Promise<string> {
  return command(host, folder, ['instructions', artifact, '--change', name, '--json']);
}

export async function openSpecStatus(host: Pick<ArchitectHost, 'exec'>, folder: string, name: string): Promise<string> {
  return command(host, folder, ['status', '--change', name, '--json']);
}
