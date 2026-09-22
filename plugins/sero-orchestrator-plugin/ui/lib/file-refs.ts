/**
 * The files a result names, so they can open from the row that names them.
 *
 * Only something that reads as a path inside the workspace counts. A URL, a
 * bare word and the rest of a sentence are not files, and offering a control
 * that cannot open them would be worse than leaving them as text.
 */

/** A token that ends in a file extension, optionally pathed. */
const FILE_REF =
  /(?:\.\.?\/)?[\w@][\w@.-]*(?:\/[\w@-][\w@.-]*)*\.(?:md|markdown|txt|json|jsonl|ya?ml|toml|tsx?|jsx?|mjs|cjs|css|scss|html|png|jpe?g|gif|svg|webp|avif|pdf|sh|zsh|lock|csv|tsv|log|env|patch|diff)(?![\w/])/g;

/**
 * A character that glues a token to what came before it. A path never starts
 * inside a word or after a `/` or `:` — which is exactly what keeps the tail of
 * `https://host/a.md` from being read as a file called `host/a.md`.
 */
const INSIDE_TOKEN = /[\w/:@\\-]/;

export interface FileRefPart {
  text: string;
  /** The workspace-relative file this part names, when it names one. */
  file?: string;
}

/** Splits a result's text into plain spans and the file references inside it. */
export function splitFileRefs(text: string): FileRefPart[] {
  const parts: FileRefPart[] = [];
  let at = 0;
  for (const match of text.matchAll(FILE_REF)) {
    const start = match.index;
    // A candidate that starts inside a word, or after `/` or `:`, is the tail
    // of something longer — a URL, most often. It stays plain text.
    if (start < at || (start > 0 && INSIDE_TOKEN.test(text[start - 1]))) continue;
    if (start > at) parts.push({ text: text.slice(at, start) });
    parts.push({ text: match[0], file: match[0] });
    at = start + match[0].length;
  }
  if (at < text.length) parts.push({ text: text.slice(at) });
  return parts;
}
