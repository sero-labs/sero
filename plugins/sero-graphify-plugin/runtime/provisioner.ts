import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ExecFn } from './bounded-exec';
import { JSON_MAX_OUTPUT_BYTES } from './bounded-exec';

/** Pinned graphifyy version — from the Task 1 spike notes. Upgrades are deliberate version bumps here. */
export const GRAPHIFY_VERSION = '0.8.36';

/**
 * Backend SDKs are optional extras of graphifyy; the bare package can only do
 * AST extraction ("the 'anthropic' package is required for this backend").
 * Install every supported backend's extra so switching backends in settings
 * never needs a reinstall (deepseek rides on the openai client).
 */
export const GRAPHIFY_INSTALL_SPEC = `graphifyy[anthropic,openai,gemini,kimi,ollama]==${GRAPHIFY_VERSION}`;

export interface ProvisionDeps {
  /** Resolve the uv executable (host.toolchains.ensure('uv')). */
  ensureUv(): Promise<string>;
  exec: ExecFn;
  /** <graphify home>/tools — everything uv-related is isolated here. */
  toolsDir: string;
}

export interface ProvisionResult {
  uvPath: string;
  graphifyPath: string;
  version: string;
}

export function graphifyBinPath(toolsDir: string): string {
  const binName = process.platform === 'win32' ? 'graphify.exe' : 'graphify';
  return path.join(toolsDir, 'bin', binName);
}

export function installSpecMarkerPath(toolsDir: string): string {
  return path.join(toolsDir, '.install-spec');
}

export function uvEnv(toolsDir: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    UV_TOOL_DIR: path.join(toolsDir, 'uv-tools'),
    UV_TOOL_BIN_DIR: path.join(toolsDir, 'bin'),
    UV_PYTHON_INSTALL_DIR: path.join(toolsDir, 'python'),
  };
}

/**
 * Idempotent: skips the install when the pinned version is runnable AND the
 * recorded install spec matches (the version probe alone cannot tell a bare
 * install from one with backend extras).
 */
export async function provisionGraphify(deps: ProvisionDeps): Promise<ProvisionResult> {
  const graphifyPath = graphifyBinPath(deps.toolsDir);
  const env = uvEnv(deps.toolsDir);
  const markerPath = installSpecMarkerPath(deps.toolsDir);

  const recordedSpec = await readFile(markerPath, 'utf8').then((s) => s.trim()).catch(() => null);
  if (recordedSpec === GRAPHIFY_INSTALL_SPEC) {
    const probe = await deps.exec(graphifyPath, ['--version'], { env, timeoutMs: 30_000 });
    if (probe.exitCode === 0 && probe.stdout.includes(GRAPHIFY_VERSION)) {
      return { uvPath: '', graphifyPath, version: GRAPHIFY_VERSION };
    }
  }

  const uvPath = await deps.ensureUv();
  const install = await deps.exec(
    uvPath,
    ['tool', 'install', '--force', GRAPHIFY_INSTALL_SPEC],
    { env, timeoutMs: 15 * 60_000, maxOutputBytes: JSON_MAX_OUTPUT_BYTES },
  );
  if (install.exitCode !== 0) {
    throw new Error(`graphifyy install failed (exit ${install.exitCode}): ${install.stderr || install.stdout}`.slice(0, 2000));
  }

  const verify = await deps.exec(graphifyPath, ['--version'], { env, timeoutMs: 30_000 });
  if (verify.exitCode !== 0) {
    throw new Error(`graphify not runnable after install: ${verify.stderr || verify.stdout}`.slice(0, 2000));
  }

  await mkdir(deps.toolsDir, { recursive: true });
  await writeFile(markerPath, GRAPHIFY_INSTALL_SPEC, 'utf8');
  return { uvPath, graphifyPath, version: GRAPHIFY_VERSION };
}
