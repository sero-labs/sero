import { createRequire } from 'module';
import path from 'path';
import { cp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';

import { SERO_HOST_ARTIFACTS_ROOT } from '@electron/platform/env';
import { toRuntimeIdentityMountPath } from '@electron/features/workspace/runtime/runtime-paths';

const PI_PACKAGE_NAME = '@earendil-works/pi-coding-agent';

/**
 * Machine-level copy of the Pi docs shared by all Sero profiles.
 *
 * Do not place this under SERO_HOME/SERO_AGENT_DIR: those are profile-scoped.
 * SERO_HOST_ARTIFACTS_ROOT is the fixed host-artifacts root used for assets
 * that must be available across profiles and source-dev roots.
 */
export const SHARED_PI_DOCS_DIR = path.join(SERO_HOST_ARTIFACTS_ROOT, 'shared', 'pi-docs');

export interface PiDocsPaths {
  root: string;
  readme: string;
  docs: string;
  examples: string;
}

export function getSharedPiDocsRoot(): string {
  return SHARED_PI_DOCS_DIR;
}

export function getHostPiDocsPaths(): PiDocsPaths {
  return buildPiDocsPaths(SHARED_PI_DOCS_DIR, path.join);
}

export function getRuntimePiDocsPaths(): PiDocsPaths {
  const runtimeRoot = toRuntimeIdentityMountPath(SHARED_PI_DOCS_DIR);
  return buildPiDocsPaths(runtimeRoot, path.posix.join);
}

function buildPiDocsPaths(
  root: string,
  join: (...parts: string[]) => string,
): PiDocsPaths {
  return {
    root,
    readme: join(root, 'README.md'),
    docs: join(root, 'docs'),
    examples: join(root, 'examples'),
  };
}

export async function ensureSharedPiDocs(): Promise<void> {
  const source = resolveBundledPiDocsSource();
  if (!source) {
    console.warn(`[setup] ${PI_PACKAGE_NAME} docs were not found; shared Pi docs unavailable.`);
    return;
  }

  await mkdir(SHARED_PI_DOCS_DIR, { recursive: true });

  await replaceDirectory(source.docs, path.join(SHARED_PI_DOCS_DIR, 'docs'));

  if (source.examples) {
    await replaceDirectory(source.examples, path.join(SHARED_PI_DOCS_DIR, 'examples'));
  } else {
    await mkdir(path.join(SHARED_PI_DOCS_DIR, 'examples'), { recursive: true });
  }

  const readme = source.readme ?? path.join(source.docs, 'index.md');
  const readmeContent = await readFile(readme, 'utf8');
  await writeFile(path.join(SHARED_PI_DOCS_DIR, 'README.md'), readmeContent, 'utf8');

  console.log(`[setup] Pi documentation available to runtimes at ${SHARED_PI_DOCS_DIR}`);
}

async function replaceDirectory(source: string, target: string): Promise<void> {
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true });
}

interface PiDocsSource {
  docs: string;
  examples: string | null;
  readme: string | null;
}

function resolveBundledPiDocsSource(): PiDocsSource | null {
  const require = createRequire(__filename);
  const candidates: string[] = [];

  try {
    const entry = require.resolve(PI_PACKAGE_NAME);
    candidates.push(path.resolve(path.dirname(entry), '..'));
  } catch {
    // Fall through to bundled/dev path candidates below.
  }

  candidates.push(
    path.resolve(__dirname, '..', '..', 'node_modules', '@earendil-works', 'pi-coding-agent'),
    path.resolve(__dirname, '..', '..', '..', 'node_modules', '@earendil-works', 'pi-coding-agent'),
    path.resolve(__dirname, '..', '..', '..', '..', 'node_modules', '@earendil-works', 'pi-coding-agent'),
  );

  for (const packageRoot of dedupeStrings(candidates)) {
    const docs = path.join(packageRoot, 'docs');
    if (!existsSync(docs)) continue;
    return {
      docs,
      examples: existsSync(path.join(packageRoot, 'examples'))
        ? path.join(packageRoot, 'examples')
        : null,
      readme: existsSync(path.join(packageRoot, 'README.md'))
        ? path.join(packageRoot, 'README.md')
        : null,
    };
  }

  return null;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}
