/**
 * Preview and export document assembly.
 *
 * `buildPreviewDocument` produces the runnable, self-contained document shown
 * in the isolated frame: strict CSP, inlined assets, the guard harness and the
 * revision's tweak manifest.
 *
 * `buildStandaloneDocument` produces the export artefact: the same page with
 * the effective tweak values resolved into plain CSS and no Sero runtime.
 */

import { PREVIEW_HARNESS_SOURCE } from './preview-harness';
import { buildTweakCss } from './tweaks';
import type { TweakManifest, TweakValue } from './tweak-types';

/**
 * No network of any kind. Images and fonts are inlined as data URIs, so no
 * host needs to be reachable for the page to render exactly as saved.
 */
export const PREVIEW_CSP = [
  "default-src 'none'",
  "img-src data: blob:",
  "media-src data: blob:",
  "font-src data:",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "connect-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "base-uri 'none'",
].join('; ');

/** The export artefact keeps the same network posture without the harness. */
export const STANDALONE_CSP = [
  "default-src 'none'",
  "img-src data: blob:",
  "media-src data: blob:",
  "font-src data:",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  "connect-src 'none'",
].join('; ');

export interface PreviewAsset {
  /** Path exactly as the generated code references it, e.g. `assets/hero.png`. */
  path: string;
  mimeType: string;
  /** Base64 payload. */
  data: string;
}

export interface PreviewDocumentInput {
  /** Body markup produced by the design. */
  bodyHtml: string;
  css: string;
  /** Optional page script produced by the design. */
  js?: string;
  title: string;
  assets?: PreviewAsset[];
  manifest: TweakManifest;
  /** Values baked into the document before the host posts any updates. */
  values?: Record<string, TweakValue>;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** `</script>` inside inlined code would close the tag early. */
function escapeScript(value: string): string {
  return value.replace(/<\/(script)/gi, '<\\/$1');
}

function assetDataUri(asset: PreviewAsset): string {
  return `data:${asset.mimeType};base64,${asset.data}`;
}

/**
 * Replace local asset references with inlined data URIs. A blob-origin frame
 * cannot resolve relative paths, and inlining is what makes previews and
 * exports byte-identical.
 */
export function inlineAssetReferences(source: string, assets: PreviewAsset[]): string {
  let result = source;
  for (const asset of assets) {
    const uri = assetDataUri(asset);
    for (const candidate of [asset.path, `./${asset.path}`, `/${asset.path}`]) {
      result = result.split(candidate).join(uri);
    }
  }
  return result;
}

export function buildPreviewDocument(input: PreviewDocumentInput): string {
  const assets = input.assets ?? [];
  const css = inlineAssetReferences(input.css, assets);
  const bodyHtml = inlineAssetReferences(input.bodyHtml, assets);
  const js = input.js ? inlineAssetReferences(input.js, assets) : '';
  const initialCss = buildTweakCss(input.manifest, input.values ?? {});

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">
<title>${escapeHtml(input.title)}</title>
<style>
${css}
</style>
${initialCss ? `<style>\n${initialCss}</style>` : ''}
<script>window.__SERO_TWEAKS__ = ${escapeScript(JSON.stringify(input.manifest))};</script>
<script>${escapeScript(PREVIEW_HARNESS_SOURCE)}</script>
</head>
<body>
${bodyHtml}
${js ? `<script>${escapeScript(js)}</script>` : ''}
</body>
</html>
`;
}

export interface StandaloneDocumentInput {
  bodyHtml: string;
  css: string;
  js?: string;
  title: string;
  assets?: PreviewAsset[];
  manifest: TweakManifest;
  values: Record<string, TweakValue>;
}

/**
 * The exported page. Every effective tweak value is written into a plain
 * `:root` block, so the artefact renders identically with no Sero code
 * present anywhere.
 */
export function buildStandaloneDocument(input: StandaloneDocumentInput): string {
  const assets = input.assets ?? [];
  const css = inlineAssetReferences(input.css, assets);
  const bodyHtml = inlineAssetReferences(input.bodyHtml, assets);
  const js = input.js ? inlineAssetReferences(input.js, assets) : '';
  const tweakCss = buildTweakCss(input.manifest, input.values, { includeDefaults: true });

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${STANDALONE_CSP}">
<title>${escapeHtml(input.title)}</title>
<style>
${css}
</style>
${tweakCss ? `<style>\n${tweakCss}</style>` : ''}
</head>
<body>
${bodyHtml}
${js ? `<script>${escapeScript(js)}</script>` : ''}
</body>
</html>
`;
}

/**
 * The Gallery card image.
 *
 * The snapshot is immutable, so rendering it in a script-free frame is
 * deterministic by construction: the same bytes always paint the same pixels,
 * with no headless browser and no Design Library-specific host API. Scripts
 * are stripped rather than sandboxed away so animation and time-dependent
 * code can never make two renders differ.
 */
export function buildDeterministicPreviewDocument(input: StandaloneDocumentInput): string {
  const document = buildStandaloneDocument({ ...input, js: undefined });
  return document.replace(
    '<head>',
    '<head>\n<style>*,*::before,*::after{animation:none!important;transition:none!important}</style>',
  );
}
