/**
 * Compile one authored character file into a self-contained worker bundle.
 *
 * The bundle is everything the bake worker runs: a determinism module first
 * (P5 — clocks and randomness throw before authored code can load), then the
 * authored character, then the driver that validates, bakes, audits and posts
 * the result. The ENGINE IS BUNDLED IN from the plugin's own dependency tree,
 * so each bake gets a fresh engine copy inside the worker's own isolate — an
 * authored file that mutates engine prototypes poisons one bake, not the
 * runtime.
 *
 * Resolution is the allowlist, as in the Library's page builds — but with the
 * opposite failure posture: a page renders best-effort around a refused
 * import, while a character with an unknown import is WRONG, and the error
 * goes back to the author instead of loading as an empty module. The bundle
 * is ESM on purpose: an ES module has no `require` in scope, so authored code
 * cannot reach Node builtins at runtime by naming them.
 *
 * esbuild strips types without checking them — the same posture as the Godot
 * original, where GDScript only parsed. The contract validation and the audit
 * gates are what catch real mistakes.
 */

import { createRequire } from 'node:module';

import * as esbuild from 'esbuild';

/** The one import an authored character may have. */
export const ENGINE_SPECIFIER = '@sero-ai/ink-and-bones';

const VIRTUAL_NAMESPACE = 'puppet-source';
const DRIVER_ENTRY = 'driver.ts';
const DETERMINISM_ENTRY = './determinism';
const CHARACTER_ENTRY = './character';

// Resolved against this module so the plugin's own engine dependency is what
// gets bundled into the worker.
const require = createRequire(import.meta.url);

export interface CompileIssue {
  text: string;
  /** 1-based, in the authored source, when esbuild could place the error. */
  line?: number;
  column?: number;
}

export type CompileResult =
  | { ok: true; code: string }
  | { ok: false; issues: CompileIssue[] };

function toIssue(message: esbuild.Message): CompileIssue {
  const location = message.location;
  // Only errors inside the authored file get a line number — a line in the
  // driver or the engine would send the author hunting in a file it cannot
  // see.
  const authored = location !== null && location.file.endsWith('character.ts');
  return {
    text: message.text,
    ...(authored ? { line: location.line, column: location.column + 1 } : {}),
  };
}

export interface WorkerSources {
  /** The authored character file. */
  character: string;
  /** The driver that runs in the worker (from run.ts). */
  driver: string;
  /** The determinism stubs, evaluated before the character module. */
  determinism: string;
}

/** Bundle character + engine + driver into one ESM file for a worker. */
export async function compilePuppetWorker(sources: WorkerSources): Promise<CompileResult> {
  // Keyed by the specifier a module writes; the value's `file` is the path
  // the module loads AS — it is what error locations name, so the authored
  // file reports as character.ts.
  const virtual = new Map<string, { file: string; contents: string }>([
    [DRIVER_ENTRY, { file: 'driver.ts', contents: sources.driver }],
    [CHARACTER_ENTRY, { file: 'character.ts', contents: sources.character }],
    [DETERMINISM_ENTRY, { file: 'determinism.ts', contents: sources.determinism }],
  ]);
  const contentsByFile = new Map([...virtual.values()].map((entry) => [entry.file, entry.contents]));

  const result = await esbuild
    .build({
      entryPoints: [DRIVER_ENTRY],
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'node',
      target: 'es2022',
      minify: false,
      logLevel: 'silent',
      plugins: [
        {
          name: 'puppet-source',
          setup(build) {
            build.onResolve({ filter: /.*/ }, (args) => {
              // The engine's own internals (real files on disk) resolve
              // normally; only the entry and the virtual modules are governed.
              const governed = args.importer === '' || args.namespace === VIRTUAL_NAMESPACE;
              if (!governed) return undefined;
              // The authored file gets the engine and nothing else — not even
              // the driver's own private modules.
              const fromCharacter =
                args.namespace === VIRTUAL_NAMESPACE && args.importer.endsWith('character.ts');
              const entry = virtual.get(args.path);
              if (!fromCharacter && entry !== undefined) {
                return { path: entry.file, namespace: VIRTUAL_NAMESPACE };
              }
              // The driver may reach Node builtins (worker_threads); authored
              // code may not name one.
              if (!fromCharacter && args.path.startsWith('node:')) {
                return { path: args.path, external: true };
              }
              if (args.path === ENGINE_SPECIFIER) {
                return { path: require.resolve(ENGINE_SPECIFIER) };
              }
              // Anything else is a mistake to report, not a module to find.
              return {
                errors: [
                  {
                    text:
                      `'${args.path}' cannot be imported. A character is a single file ` +
                      `whose only import is '${ENGINE_SPECIFIER}'.`,
                  },
                ],
              };
            });
            build.onLoad({ filter: /.*/, namespace: VIRTUAL_NAMESPACE }, (args) => ({
              contents: contentsByFile.get(args.path) ?? '',
              loader: 'ts',
            }));
          },
        },
      ],
    })
    .catch((error: unknown) => {
      // esbuild throws a BuildFailure carrying the same Message[] it would
      // otherwise return; anything else becomes one plain issue.
      const failure = error as { errors?: esbuild.Message[] };
      return {
        errors: Array.isArray(failure.errors)
          ? failure.errors
          : [{ text: error instanceof Error ? error.message : String(error) } as esbuild.Message],
        outputFiles: [] as esbuild.OutputFile[],
      };
    });

  if (result.errors.length > 0) {
    return { ok: false, issues: result.errors.map(toIssue) };
  }
  const code = result.outputFiles?.[0]?.text ?? '';
  if (code.trim() === '') {
    return { ok: false, issues: [{ text: 'The character compiled to nothing.' }] };
  }
  return { ok: true, code };
}
