import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ExecFn } from './bounded-exec';
import { JSON_MAX_OUTPUT_BYTES } from './bounded-exec';

/**
 * Pinned graphifyy version. Upgrades are deliberate bumps here, never a range.
 *
 * Raised from 0.8.36, which predates six upstream fixes for work that was
 * billed twice because the semantic cache, the stat index, or the manifest
 * failed to record it: 0.9.17 (manifest dropped fresh documents, breaking the
 * incremental baseline), 0.9.18 (a truncated chunk entered the cache as
 * complete), 0.9.27 (absolute stat-index keys re-extracted a moved corpus),
 * 0.9.28 (non-ASCII paths re-extracted everything), 0.9.41 (a warm cache hit
 * re-anchored paths when cwd differed from the graph root — which Sero always
 * does), 0.9.42 (a corrupt cache entry silently re-billed every run).
 */
export const GRAPHIFY_VERSION = '0.9.47';

/**
 * Backend SDKs are optional extras of graphifyy; the bare package can only do
 * AST extraction ("the 'anthropic' package is required for this backend").
 * Install every offered backend's extra so switching backends never needs a
 * reinstall. deepseek rides on the openai client. `bedrock` pulls boto3; `azure`
 * has no extra of its own because it rides on the openai client. A missing
 * extra fails the build after the toolchain is ready, which — before the debit
 * moved to the last boundary — also charged the user for it.
 */
const BACKEND_EXTRAS = 'anthropic,openai,gemini,kimi,ollama,bedrock';

export function installSpecFor(version: string): string {
  return `graphifyy[${BACKEND_EXTRAS}]==${version}`;
}

export const GRAPHIFY_INSTALL_SPEC = installSpecFor(GRAPHIFY_VERSION);

export interface ProvisionDeps {
  /** Resolve the uv executable (host.toolchains.ensure('uv')). */
  ensureUv(): Promise<string>;
  exec: ExecFn;
  /** <graphify home>/tools — everything uv-related is isolated here. */
  toolsDir: string;
  /** Environment the uv/graphify processes run in (already allow-listed). */
  baseEnv: NodeJS.ProcessEnv;
  /** Install this instead of the pin — a user-approved upgrade. */
  version?: string;
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

export function uvEnv(toolsDir: string, baseEnv: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    UV_TOOL_DIR: path.join(toolsDir, 'uv-tools'),
    UV_TOOL_BIN_DIR: path.join(toolsDir, 'bin'),
    UV_PYTHON_INSTALL_DIR: path.join(toolsDir, 'python'),
  };
}

/**
 * Idempotent: skips the install when the wanted version is runnable AND the
 * recorded install spec matches (the version probe alone cannot tell a bare
 * install from one with backend extras).
 */
export async function provisionGraphify(deps: ProvisionDeps): Promise<ProvisionResult> {
  const version = deps.version ?? GRAPHIFY_VERSION;
  const spec = installSpecFor(version);
  const graphifyPath = graphifyBinPath(deps.toolsDir);
  const env = uvEnv(deps.toolsDir, deps.baseEnv);
  const markerPath = installSpecMarkerPath(deps.toolsDir);

  const recordedSpec = await readFile(markerPath, 'utf8').then((s) => s.trim()).catch(() => null);
  if (recordedSpec === spec) {
    const probe = await deps.exec(graphifyPath, ['--version'], { env, timeoutMs: 30_000 });
    if (probe.exitCode === 0 && probe.stdout.includes(version)) {
      return { uvPath: '', graphifyPath, version };
    }
  }

  const uvPath = await deps.ensureUv();
  const install = await deps.exec(
    uvPath,
    ['tool', 'install', '--force', spec],
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
  await writeFile(markerPath, spec, 'utf8');
  return { uvPath, graphifyPath, version };
}

/**
 * Latest graphifyy on PyPI, or null when the check fails.
 *
 * Best-effort and never blocking: this only ever *offers* an upgrade. Installing
 * a new extractor invalidates the semantic cache, so applying one re-extracts
 * the corpus and spends money — which makes an automatic upgrade unacceptable.
 */
export async function latestPublishedVersion(): Promise<string | null> {
  const response = await fetch('https://pypi.org/pypi/graphifyy/json', {
    signal: AbortSignal.timeout(10_000),
  }).catch(() => null);
  if (!response?.ok) return null;
  const body = await response.json().catch(() => null) as { info?: { version?: unknown } } | null;
  const version = body?.info?.version;
  return typeof version === 'string' && version ? version : null;
}
