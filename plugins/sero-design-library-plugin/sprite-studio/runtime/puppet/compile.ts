/**
 * Compile one authored character file against the engine.
 *
 * The source is TypeScript written by a model (or a person) that imports only
 * '@sero-ai/ink-and-bones'. It is bundled the way the Library bundles
 * generated pages — an in-memory virtual module, resolution as the allowlist —
 * but with the opposite failure posture: a page renders best-effort around a
 * refused import, while a character with an unknown import is WRONG, and the
 * error goes back to the author as feedback instead of loading as an empty
 * module. The engine itself stays external; the runtime hands its own copy to
 * the bundle at execution time, so `instanceof` checks against engine classes
 * hold across the boundary.
 *
 * esbuild strips types without checking them — the same posture as the Godot
 * original, where GDScript only parsed. The contract validation and the audit
 * gates are what catch real mistakes.
 */

import * as esbuild from 'esbuild';

/** The one import an authored character may have. */
export const ENGINE_SPECIFIER = '@sero-ai/ink-and-bones';

const VIRTUAL_NAMESPACE = 'puppet-source';
const ENTRY = 'character.ts';

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
  return {
    text: message.text,
    ...(location === null ? {} : { line: location.line, column: location.column + 1 }),
  };
}

/** Bundle the authored source to CommonJS with the engine left as a require. */
export async function compilePuppetSource(source: string): Promise<CompileResult> {
  const result = await esbuild
    .build({
      entryPoints: [ENTRY],
      bundle: true,
      write: false,
      format: 'cjs',
      platform: 'neutral',
      target: 'es2022',
      minify: false,
      logLevel: 'silent',
      plugins: [
        {
          name: 'puppet-source',
          setup(build) {
            build.onResolve({ filter: /.*/ }, (args) => {
              if (args.importer === '' && args.path === ENTRY) {
                return { path: ENTRY, namespace: VIRTUAL_NAMESPACE };
              }
              if (args.path === ENGINE_SPECIFIER) {
                return { path: ENGINE_SPECIFIER, external: true };
              }
              // Anything else is a mistake to report, not a module to find.
              // A character is ONE file against ONE API; an import of a second
              // file or another package means the author misunderstood the
              // contract, and the message says exactly what to do instead.
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
            build.onLoad({ filter: /.*/, namespace: VIRTUAL_NAMESPACE }, () => ({
              contents: source,
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
