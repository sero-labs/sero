import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import * as esbuild from 'esbuild';

import type { EmittedFile } from '../../shared/targets';
import { TARGET_CONTRACTS } from '../../shared/targets';
import { assemblePreviewDocument } from '../preview/document';
import type { PreviewDocumentInput } from '../preview/document';
import type { BuildResult } from './types';

/**
 * The React target: transform the emitted TSX and bundle it into one script.
 *
 * Resolution is the enforcement point for the approved import set (spec §6.3).
 * esbuild is given a plugin that resolves relative paths within the emitted files
 * and the approved packages from the plugin's own dependencies — and nothing
 * else. An import outside that set is not filtered out of a list, it simply has
 * nowhere to resolve to, so no string-scanning mistake can let one through.
 *
 * Tailwind travels with the page as its browser build. The frame has no network
 * and no build step, so the compiler has to be inside the document; it reads the
 * class names off the DOM and writes the stylesheet at load.
 */

const VIRTUAL_NAMESPACE = 'design-library-generated';
const MOUNT_ENTRY = '__sero_mount.tsx';

// Resolved against this module so the plugin's own dependency tree is what gets
// bundled — the point of "React comes from the plugin's dependencies".
const require = createRequire(import.meta.url);

/**
 * The mount shim. Generated code never calls `createRoot` itself: the model would
 * have to guess the container id, and a page that mounts twice or not at all is a
 * failure with no useful error.
 */
function mountSource(entry: string): string {
  return `import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './${entry}';

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<StrictMode><App /></StrictMode>);
}
`;
}

/**
 * The emitted file a specifier names, allowing for the extension the model left
 * off. Returns null when nothing was written under any of the target's suffixes.
 */
function resolveEmitted(sources: Map<string, string>, specifier: string): string | null {
  const bare = specifier.replace(/^\.\//, '');
  if (sources.has(bare)) return bare;
  for (const extension of TARGET_CONTRACTS.react.extensions) {
    if (sources.has(`${bare}${extension}`)) return `${bare}${extension}`;
  }
  return null;
}

function tailwindEntrySource(styles: string[]): string {
  // `type="text/tailwindcss"` is how the browser build takes custom CSS: the
  // block is compiled rather than applied directly, so `@apply` and `@theme`
  // in a generated stylesheet work the same as they would in a real project.
  return styles.join('\n\n');
}

export interface ReactBuildOptions {
  /** Overridden in tests so a build can run without the real dependency tree. */
  resolvePackage?: (specifier: string) => string;
  /** Overridden in tests to avoid inlining a 260 KB compiler into a fixture. */
  tailwindRuntime?: () => Promise<string>;
  /** Custom properties the document will accept a live tweak value for. */
  tweakVariables?: readonly string[];
  /** Different final wrapper for an export, which has no preview harness. */
  assembleDocument?: (input: PreviewDocumentInput) => string;
  /** Trusted standalone CSS, such as bundled local font faces. */
  supplementalStyles?: readonly string[];
  /** Trusted custom properties baked onto a standalone document root. */
  rootVariables?: Readonly<Record<string, string>>;
}

async function readTailwindRuntime(): Promise<string> {
  return readFile(require.resolve('@tailwindcss/browser'), 'utf8');
}

export async function buildReactDocument(
  files: EmittedFile[],
  options: ReactBuildOptions = {},
): Promise<BuildResult> {
  const contract = TARGET_CONTRACTS.react;
  const warnings: string[] = [];
  const entry = files.find((file) => file.name === contract.entry);
  if (!entry) {
    return { warnings: [`There is no \`${contract.entry}\`, so nothing could be built.`] };
  }

  const sources = new Map(files.map((file) => [file.name, file.content]));
  sources.set(MOUNT_ENTRY, mountSource(contract.entry));
  const styles = files.filter((file) => file.name.endsWith('.css'));
  const resolvePackage = options.resolvePackage ?? ((specifier) => require.resolve(specifier));

  const refusals: string[] = [];
  const result = await esbuild
    .build({
      entryPoints: [MOUNT_ENTRY],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      target: 'es2022',
      jsx: 'automatic',
      minify: false,
      // React ships its development build behind this, and the development build
      // logs to a console nobody can see and runs slower for no benefit here.
      define: { 'process.env.NODE_ENV': '"production"' },
      logLevel: 'silent',
      plugins: [
        {
          name: 'design-library-sources',
          setup(build) {
            build.onResolve({ filter: /.*/ }, (args) => {
              // Only generated code is governed by the approved set. An approved
              // package's own internals resolve normally — React reaches for
              // `./cjs/react.production.js`, and intercepting that would refuse
              // React itself.
              const fromGenerated = args.importer === '' || args.namespace === VIRTUAL_NAMESPACE;
              if (!fromGenerated) return undefined;

              // Emitted files, addressed relatively or by bare name. Models write
              // `./Panel` as often as `./Panel.tsx`, and both mean the file.
              const emitted = resolveEmitted(sources, args.path);
              if (emitted !== null) return { path: emitted, namespace: VIRTUAL_NAMESPACE };
              if (args.path.startsWith('.')) {
                // A relative import naming nothing that was written. Reported
                // rather than resolved: esbuild would otherwise look for it on
                // the real filesystem, which is not this page's business.
                refusals.push(
                  `\`${args.importer.replace(`${VIRTUAL_NAMESPACE}:`, '')}\` imports \`${args.path}\`, which was never written.`,
                );
                return { path: args.path, namespace: 'design-library-missing' };
              }

              const approved = contract.approvedImports.some(
                (name) => args.path === name || args.path.startsWith(`${name}/`),
              );
              if (!approved) {
                refusals.push(
                  `Refused to bundle \`${args.path}\` — a preview may only use ${contract.approvedImports.join(', ')}.`,
                );
                return { path: args.path, namespace: 'design-library-missing' };
              }
              return { path: resolvePackage(args.path) };
            });

            build.onLoad({ filter: /.*/, namespace: VIRTUAL_NAMESPACE }, (args) => {
              const contents = sources.get(args.path) ?? '';
              const extension = path.extname(args.path).slice(1);
              return {
                contents,
                // CSS is compiled by Tailwind inside the document, not bundled
                // into the script, so an imported stylesheet contributes nothing
                // here and must not be parsed as JavaScript.
                loader: extension === 'css' ? 'empty' : (extension as 'tsx' | 'ts'),
              };
            });

            // A refused specifier still has to load as *something*, or esbuild
            // fails the whole build and the page is lost along with the report.
            // An empty module means the page renders without that feature and the
            // warning explains why — never that the import worked.
            //
            // CommonJS rather than an ES module on purpose: a named import from
            // an empty ES module is a compile error, so `import { Chart } from
            // 'recharts'` would still take the whole page down. Through CJS
            // interop the same import is a property read that yields undefined,
            // which is what a missing module honestly looks like.
            build.onLoad({ filter: /.*/, namespace: 'design-library-missing' }, () => ({
              contents: 'module.exports = {};',
              loader: 'js',
            }));
          },
        },
      ],
    })
    .catch((error: unknown) => ({
      errors: [{ text: error instanceof Error ? error.message : String(error) }],
      outputFiles: [] as esbuild.OutputFile[],
      warnings: [] as esbuild.Message[],
    }));

  warnings.push(...refusals);
  for (const message of result.warnings ?? []) warnings.push(message.text);

  if (result.errors.length > 0) {
    // A compile error is not a warning. Nothing renderable exists, so the
    // variant fails and says why rather than showing an empty frame.
    return {
      warnings: [
        ...warnings,
        ...result.errors.map((message) => `Could not compile the design: ${message.text}`),
      ],
    };
  }

  const script = result.outputFiles?.[0]?.text ?? '';
  if (script.trim() === '') {
    return { warnings: [...warnings, 'The design compiled to nothing.'] };
  }

  const tailwind = await (options.tailwindRuntime ?? readTailwindRuntime)().catch(
    (error: unknown) => {
      warnings.push(
        `Tailwind could not be inlined (${error instanceof Error ? error.message : String(error)}), so utility classes will have no effect.`,
      );
      return '';
    },
  );

  const custom = tailwindEntrySource(styles.map((file) => file.content));

  return {
    document: (options.assembleDocument ?? assemblePreviewDocument)({
      title: 'Design preview',
      styles: [...(options.supplementalStyles ?? [])],
      // The compiler must run before the page mounts, so the first paint already
      // has its stylesheet. Both are inline scripts in document order.
      scripts: [tailwind, script].filter((entry) => entry !== ''),
      head:
        custom.trim() === ''
          ? ''
          : `<style type="text/tailwindcss">\n${custom.replace(/<\/style/gi, '<\\/style')}\n</style>`,
      body: '<div id="root"></div>',
      tweakVariables: options.tweakVariables ?? [],
      rootVariables: options.rootVariables,
    }),
    warnings,
  };
}
