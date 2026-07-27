/**
 * What each output target may contain (spec §6.3).
 *
 * Both targets run entirely from what the plugin bundles, and generated code may
 * not import anything outside the approved set. This module is the single place
 * that set is written down: the generation run quotes it in the brief, the emit
 * tool checks against it as files arrive, and the build refuses to resolve
 * anything absent from it.
 *
 * The check happens three times on purpose. The brief is guidance a model can
 * ignore, the emit check is fast feedback it can act on, and the build is the
 * only one that is authoritative — it resolves nothing the set does not name, so
 * an import that slips past a string scan still cannot reach the document.
 */

import type { OutputTarget } from './design';

export interface TargetContract {
  /** The file the build starts from. A revision without it cannot be built. */
  entry: string;
  /** File extensions the model may write. */
  extensions: readonly string[];
  /** Bare module specifiers the build will resolve. Everything else is refused. */
  approvedImports: readonly string[];
  /** How the target is described in the brief. */
  label: string;
}

export const TARGET_CONTRACTS: Record<OutputTarget, TargetContract> = {
  html: {
    entry: 'index.html',
    extensions: ['.html', '.css', '.js'],
    // A self-contained document has no module graph: styles and script are
    // inlined into it, and there is nothing left for an import to name.
    approvedImports: [],
    label: 'self-contained HTML, CSS and minimal JavaScript',
  },
  react: {
    entry: 'App.tsx',
    extensions: ['.tsx', '.ts', '.css'],
    approvedImports: [
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      // The bundled icon set (spec §6.6). Tree-shaken, so only the icons a page
      // actually uses reach the document.
      'lucide-react',
    ],
    label: 'React with TypeScript and Tailwind utility classes',
  },
};

/** One generated file, before it is written anywhere. */
export interface EmittedFile {
  name: string;
  content: string;
}

/** The largest single file a generation run may write. */
export const MAX_FILE_BYTES = 256 * 1024;
/** The most files one revision may contain. */
export const MAX_FILES = 12;

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * Why a file name is unusable, or null when it is fine. The name is joined onto
 * a directory path, so this is a safety check and not only a tidiness one.
 */
export function refuseFileName(target: OutputTarget, name: string): string | null {
  if (!NAME_PATTERN.test(name)) {
    return `\`${name}\` is not a usable file name. Use a plain name like \`${TARGET_CONTRACTS[target].entry}\` — no directories, no leading dot.`;
  }
  const contract = TARGET_CONTRACTS[target];
  const extension = name.slice(name.lastIndexOf('.')).toLowerCase();
  if (!contract.extensions.includes(extension)) {
    return `\`${name}\` is not a file this target uses. Allowed: ${contract.extensions.join(', ')}.`;
  }
  return null;
}

/**
 * Bare module specifiers a source file imports, ignoring relative ones.
 *
 * Deliberately shallow: it reads `import`/`export ... from` and `require(...)`
 * and nothing cleverer. It exists to tell a model quickly that it reached for a
 * package it cannot have — the build decides what actually resolves.
 */
export function bareImportsOf(source: string): string[] {
  const found = new Set<string>();
  const patterns = [
    /(?:^|[\s;}])(?:import|export)\s[^;'"]*?from\s*['"]([^'"]+)['"]/g,
    /(?:^|[\s;}])import\s*['"]([^'"]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier === undefined) continue;
      if (specifier.startsWith('.') || specifier.startsWith('/')) continue;
      found.add(specifier);
    }
  }
  return [...found];
}

/**
 * Imports the target does not approve. A subpath of an approved package is
 * allowed — `lucide-react/icons/x` is still the bundled icon set — but a
 * different package never is.
 */
export function unapprovedImports(target: OutputTarget, source: string): string[] {
  const approved = TARGET_CONTRACTS[target].approvedImports;
  return bareImportsOf(source).filter(
    (specifier) =>
      !approved.some((entry) => specifier === entry || specifier.startsWith(`${entry}/`)),
  );
}

/**
 * Remote URLs referenced from a document, which a preview can never load.
 *
 * A protocol-relative `//host/path` only counts when it opens an attribute value
 * or a `url()`. Matching it anywhere would read `//TODO: fix this` as a network
 * reference and refuse a perfectly good file over a comment.
 */
export function remoteReferencesOf(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(
    /(?:https?:\/\/|(?<=["'(])\/\/)[A-Za-z0-9][^\s'"()<>]*/g,
  )) {
    const url = match[0];
    // A namespace declaration is not a fetch, and every generated SVG has one.
    if (url.includes('www.w3.org')) continue;
    found.add(url);
  }
  return [...found];
}
