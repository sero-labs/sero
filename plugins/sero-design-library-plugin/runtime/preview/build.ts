/**
 * Preview construction for both output targets.
 *
 * HTML previews are assembled directly. React previews are compiled locally
 * with esbuild (JSX + TypeScript, react bundled from the plugin's own
 * dependencies) and Tailwind's offline compiler. Nothing is fetched, so a
 * preview built once always renders the same way.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildPreviewDocument, type PreviewAsset } from '../../shared/preview-document';
import type { SourceFile } from '../../shared/records';
import type { TweakManifest, TweakValue } from '../../shared/tweak-types';

export interface PreviewBuildInput {
  title: string;
  files: SourceFile[];
  assets: PreviewAsset[];
  manifest: TweakManifest;
  values?: Record<string, TweakValue>;
}

export interface PreviewBuildResult {
  html: string;
  /** Non-fatal problems to surface as preview warnings. */
  warnings: string[];
}

function fileContents(files: SourceFile[], filePath: string): string {
  return files.find((file) => file.path === filePath)?.contents ?? '';
}

export function buildHtmlPreview(input: PreviewBuildInput): PreviewBuildResult {
  return {
    html: buildPreviewDocument({
      title: input.title,
      bodyHtml: fileContents(input.files, 'body.html'),
      css: fileContents(input.files, 'styles.css'),
      js: fileContents(input.files, 'app.js'),
      assets: input.assets,
      manifest: input.manifest,
      ...(input.values ? { values: input.values } : {}),
    }),
    warnings: [],
  };
}

/** Imports the generated React source is permitted to use. */
export const REACT_IMPORT_ALLOW_LIST = new Set(['react', 'react-dom', 'react-dom/client', 'lucide-react']);

const IMPORT_PATTERN = /from\s+['"]([^'"]+)['"]/g;

/** Bare specifiers outside the approved bundle, reported and refused. */
export function disallowedImports(source: string): string[] {
  const found = new Set<string>();
  let match = IMPORT_PATTERN.exec(source);
  while (match !== null) {
    const specifier = match[1];
    const isRelative = specifier.startsWith('.') || specifier.startsWith('/');
    if (!isRelative && !REACT_IMPORT_ALLOW_LIST.has(specifier)) found.add(specifier);
    match = IMPORT_PATTERN.exec(source);
  }
  return [...found];
}

export interface ReactBuildDeps {
  /** Directory whose node_modules resolves react, react-dom and lucide-react. */
  resolveDir: string;
  esbuild: {
    build(options: Record<string, unknown>): Promise<{ outputFiles?: Array<{ text: string }> }>;
  };
  tailwind: {
    compile(css: string, options?: Record<string, unknown>): Promise<{
      build(candidates: string[]): string;
    }>;
  };
}

const ENTRY_SOURCE = `import { createRoot } from 'react-dom/client';
import App from './App';
createRoot(document.getElementById('root')).render(<App />);
`;

/** Every Tailwind-looking class name in the source, for the offline compiler. */
export function extractClassCandidates(source: string): string[] {
  const candidates = new Set<string>();
  const pattern = /class(?:Name)?\s*=\s*["'`]([^"'`]+)["'`]/g;
  let match = pattern.exec(source);
  while (match !== null) {
    match[1].split(/\s+/).filter(Boolean).forEach((candidate) => candidates.add(candidate));
    match = pattern.exec(source);
  }
  return [...candidates];
}

export async function buildReactPreview(
  input: PreviewBuildInput,
  deps: ReactBuildDeps,
): Promise<PreviewBuildResult> {
  const appSource = fileContents(input.files, 'App.tsx');
  const designCss = fileContents(input.files, 'styles.css');
  const warnings: string[] = [];

  const blocked = disallowedImports(appSource);
  if (blocked.length > 0) {
    warnings.push(
      `Blocked dependencies outside the approved bundle: ${blocked.join(', ')}.`,
    );
  }

  const virtualFiles = new Map<string, string>([
    ['/__entry.tsx', ENTRY_SOURCE],
    ['/App.tsx', appSource],
  ]);

  const bundle = await deps.esbuild.build({
    stdin: { contents: ENTRY_SOURCE, resolveDir: deps.resolveDir, loader: 'tsx', sourcefile: '__entry.tsx' },
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2020',
    jsx: 'automatic',
    minify: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [{
      name: 'design-library-virtual',
      setup(build: {
        onResolve(options: { filter: RegExp }, callback: (args: { path: string }) => unknown): void;
        onLoad(options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => unknown): void;
      }) {
        build.onResolve({ filter: /^\.\/App$/ }, () => ({ path: '/App.tsx', namespace: 'design-library' }));
        build.onLoad({ filter: /.*/, namespace: 'design-library' }, (args) => ({
          contents: virtualFiles.get(args.path) ?? '',
          loader: 'tsx',
          resolveDir: deps.resolveDir,
        }));
      },
    }],
  });

  const js = bundle.outputFiles?.[0]?.text ?? '';

  const compiler = await deps.tailwind.compile('@import "tailwindcss";', { base: deps.resolveDir });
  const utilities = compiler.build(extractClassCandidates(appSource));

  return {
    html: buildPreviewDocument({
      title: input.title,
      bodyHtml: '<div id="root"></div>',
      css: `${utilities}\n${designCss}`,
      js,
      assets: input.assets,
      manifest: input.manifest,
      ...(input.values ? { values: input.values } : {}),
    }),
    warnings,
  };
}

/** Read a Design's stored assets as inlineable preview assets. */
export async function loadPreviewAssets(
  assetsRoot: string,
  assets: Array<{ id: string; fileName: string; mimeType: string }>,
): Promise<PreviewAsset[]> {
  const loaded: PreviewAsset[] = [];
  for (const asset of assets) {
    const bytes = await readFile(path.join(assetsRoot, asset.id, asset.fileName)).catch(() => null);
    if (!bytes) continue;
    loaded.push({
      path: `assets/${asset.id}/${asset.fileName}`,
      mimeType: asset.mimeType,
      data: bytes.toString('base64'),
    });
  }
  return loaded;
}
