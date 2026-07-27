import type { EmittedFile } from '../../shared/targets';
import { remoteReferencesOf } from '../../shared/targets';
import { assemblePreviewDocument } from '../preview/document';
import type { BuildResult } from './types';

/**
 * The HTML target: fold the emitted files into one document.
 *
 * A local `<link>` or `<script src>` cannot be left as-is — the preview loads
 * from a blob URL with no origin to resolve a relative path against, so the file
 * simply would not arrive. Inlining is what makes the document work at all, and
 * it is also what makes an export runnable from a folder.
 *
 * Anything remote is removed and reported. Leaving the tag in place would let the
 * platform block it silently and the page would render half-styled with no
 * explanation; removing it without saying so would be worse.
 */

const LINK_PATTERN = /<link\b[^>]*>/gi;
const SCRIPT_SRC_PATTERN = /<script\b[^>]*\bsrc\s*=\s*("[^"]*"|'[^']*')[^>]*>\s*<\/script\s*>/gi;

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(tag);
  return match?.[2] ?? match?.[3] ?? null;
}

function isRemote(reference: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(reference) || reference.startsWith('data:');
}

export function buildHtmlDocument(files: EmittedFile[]): BuildResult {
  const warnings: string[] = [];
  const byName = new Map(files.map((file) => [file.name, file.content]));
  const entry = byName.get('index.html');
  if (entry === undefined) {
    return { warnings: ['There is no `index.html`, so nothing could be built.'] };
  }

  const inlinedStyles: string[] = [];
  const inlinedScripts: string[] = [];
  const consumed = new Set<string>(['index.html']);

  let markup = entry.replace(LINK_PATTERN, (tag) => {
    const rel = (attribute(tag, 'rel') ?? '').toLowerCase();
    const href = attribute(tag, 'href');
    if (href === null) return '';
    if (isRemote(href)) {
      warnings.push(`Removed a link to ${href} — a preview has no network.`);
      return '';
    }
    if (rel !== 'stylesheet') {
      // A preload, icon or manifest has nothing to point at inside a
      // single-file document, so it is dropped without a warning.
      return '';
    }
    const css = byName.get(href);
    if (css === undefined) {
      warnings.push(`\`index.html\` links \`${href}\`, which was never written.`);
      return '';
    }
    consumed.add(href);
    inlinedStyles.push(css);
    return '';
  });

  markup = markup.replace(SCRIPT_SRC_PATTERN, (tag) => {
    const src = attribute(tag, 'src');
    if (src === null) return '';
    if (isRemote(src)) {
      warnings.push(`Removed a script from ${src} — a preview has no network.`);
      return '';
    }
    const code = byName.get(src);
    if (code === undefined) {
      warnings.push(`\`index.html\` loads \`${src}\`, which was never written.`);
      return '';
    }
    consumed.add(src);
    inlinedScripts.push(code);
    return '';
  });

  // A file the model wrote but never referenced still belongs in the page — the
  // reference is the mistake, not the file, and dropping it silently would leave
  // a page missing its styles for no visible reason.
  for (const file of files) {
    if (consumed.has(file.name)) continue;
    if (file.name.endsWith('.css')) {
      inlinedStyles.push(file.content);
      warnings.push(`\`${file.name}\` was not linked from \`index.html\`; it was inlined anyway.`);
    } else if (file.name.endsWith('.js')) {
      inlinedScripts.push(file.content);
      warnings.push(`\`${file.name}\` was not loaded from \`index.html\`; it was inlined anyway.`);
    }
  }

  for (const reference of remoteReferencesOf(markup)) {
    warnings.push(`\`index.html\` references ${reference}, which will not load — a preview has no network.`);
  }

  const { head, body, title } = splitDocument(markup);

  return {
    document: assemblePreviewDocument({
      title: title === '' ? 'Design preview' : title,
      styles: [...extractInlineStyles(head), ...inlinedStyles],
      scripts: inlinedScripts,
      body,
    }),
    warnings,
  };
}

/**
 * Pull the model's `<head>` and `<body>` apart so the harness can be installed
 * ahead of both. A fragment with neither is treated as the body, which is what a
 * model that wrote only markup meant.
 */
function splitDocument(markup: string): { head: string; body: string; title: string } {
  const headMatch = /<head\b[^>]*>([\s\S]*?)<\/head\s*>/i.exec(markup);
  const bodyMatch = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(markup);
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(markup);

  const head = headMatch?.[1] ?? '';
  const body =
    bodyMatch?.[1] ??
    // No <body>: strip the document scaffolding and keep whatever is left.
    markup
      .replace(/<!doctype[^>]*>/gi, '')
      .replace(/<\/?html\b[^>]*>/gi, '')
      .replace(/<head\b[^>]*>[\s\S]*?<\/head\s*>/gi, '');

  return { head, body, title: (titleMatch?.[1] ?? '').trim() };
}

function extractInlineStyles(head: string): string[] {
  return [...head.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}
