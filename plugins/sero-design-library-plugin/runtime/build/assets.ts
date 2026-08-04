/**
 * Folding generated media into the preview document.
 *
 * A preview has no network and no origin to resolve a relative path against, so
 * `src="assets/x.image"` would simply not load — the same reason a local
 * stylesheet has to be inlined. Every asset therefore becomes a `data:` URI
 * inside the document, which is also what keeps the promise that no remote URL
 * ever reaches a preview (spec §6.6).
 *
 * A reference with no asset behind it — the generation failed, or the user
 * deleted it — is replaced with a local placeholder rather than left to 404 into
 * a broken-image icon. The page still reads, and the tray is where the failure
 * is explained and retried.
 */

export interface BuildAsset {
  /** How the page refers to it, e.g. `assets/<id>.image`. */
  reference: string;
  bytes: Uint8Array;
  mediaType: string;
}

/**
 * Base64 costs a third on top, and the document is held in memory, written to
 * disk and handed to a blob URL. A page of large artwork is still fine; a page
 * carrying a minute of video is not, and it fails as a placeholder and a warning
 * rather than as an unresponsive preview.
 */
const MAX_INLINE_BYTES = 12 * 1024 * 1024;

/** A neutral local stand-in. Deliberately not an error graphic — see the note. */
const PLACEHOLDER =
  'data:image/svg+xml;base64,' +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 10" role="img" aria-label="Artwork unavailable">' +
      '<rect width="16" height="10" fill="#d8d8dc"/>' +
      '<path d="M0 10 L6 4 L9 7 L11 5.5 L16 10 Z" fill="#b9b9c0"/>' +
      '<circle cx="11.5" cy="3" r="1.2" fill="#b9b9c0"/>' +
      '</svg>',
    'utf8',
  ).toString('base64');

/**
 * A whole reference token, never a prefix of one.
 *
 * The matcher is what makes this safe. Replacing reference by reference —
 * substituting `assets/a.png` everywhere, then `assets/a.png.bak` — rewrites the
 * first reference *inside* the second and leaves `…base64,AQEB.bak` in the page.
 * Matching the maximal token and looking each one up cannot do that.
 */
const REFERENCE_PATTERN = /assets\/[A-Za-z0-9._-]+/g;

/**
 * Every `assets/...` reference the document mentions.
 *
 * Matched on the document rather than driven from the asset list, so a page
 * pointing at an asset that no longer exists is *found* rather than silently
 * left broken — which is the case the placeholder is for.
 */
export function referencedAssets(document: string): string[] {
  return [...new Set([...document.matchAll(REFERENCE_PATTERN)].map((match) => match[0]))];
}

export function inlineAssets(
  document: string,
  assets: BuildAsset[],
): { document: string; warnings: string[] } {
  const byReference = new Map(assets.map((asset) => [asset.reference, asset]));
  const warnings = new Map<string, string>();

  const output = document.replace(REFERENCE_PATTERN, (reference) => {
    const asset = byReference.get(reference);
    if (asset === undefined) {
      warnings.set(
        reference,
        `\`${reference}\` has no artwork behind it, so a placeholder is shown. Retry it in the asset tray.`,
      );
      return PLACEHOLDER;
    }
    if (asset.bytes.byteLength > MAX_INLINE_BYTES) {
      warnings.set(
        reference,
        `\`${reference}\` is ${Math.round(asset.bytes.byteLength / (1024 * 1024))} MB, too large to embed in a preview, so a placeholder is shown. The export carries the real file.`,
      );
      return PLACEHOLDER;
    }
    return `data:${asset.mediaType};base64,${Buffer.from(asset.bytes).toString('base64')}`;
  });

  // Keyed by reference, so a page using the same missing asset three times says
  // so once rather than filling the warning list with one repeated sentence.
  return { document: output, warnings: [...warnings.values()] };
}
