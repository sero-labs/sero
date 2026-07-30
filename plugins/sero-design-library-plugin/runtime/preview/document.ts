import { PREVIEW_CSP, buildPreviewHarness } from './harness';
import { REDUCED_MOTION_CSS } from '../build/motion';

/**
 * Assembling the one file a preview runs from.
 *
 * The generated page is folded into one document. Design fonts arrive as bundled
 * bytes from the parent and are installed by the trusted harness; generated
 * markup and code cannot add network dependencies (spec §6.3, §7).
 */

/** `</script>` inside inlined code would end the tag early and escape the block. */
function forInlineScript(code: string): string {
  return code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
}

function forInlineStyle(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}

export interface PreviewDocumentInput {
  title: string;
  /** Inlined into one `<style>` block, in order. */
  styles: string[];
  /** Inlined after the harness, in order. */
  scripts: string[];
  /** Markup for `<body>`, before the scripts. */
  body: string;
  /** Extra `<head>` content the target needs — the Tailwind compiler, say. */
  head?: string;
  /** Trusted values baked onto the root element by standalone exports. */
  rootVariables?: Readonly<Record<string, string>>;
  /**
   * Custom properties this revision's tweak manifest declared. The document
   * accepts a live value for these and for nothing else (spec §6.5).
   */
  tweakVariables?: readonly string[];
}

/**
 * The harness goes in `<head>`, ahead of everything the page brings with it. A
 * guard installed after generated code has already run is not a guard: a script
 * at the top of `<body>` would have called `fetch` before it was replaced.
 */
export function assemblePreviewDocument(input: PreviewDocumentInput): string {
  const styles = [...input.styles, REDUCED_MOTION_CSS]
    .flatMap((style) => style.trim() === '' ? [] : [forInlineStyle(style)])
    .join('\n\n');

  const scripts = input.scripts
    .flatMap((script) =>
      script.trim() === '' ? [] : [`<script>\n${forInlineScript(script)}\n</script>`],
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">
<title>${escapeHtml(input.title)}</title>
<script>
${forInlineScript(buildPreviewHarness(input.tweakVariables ?? []))}
</script>
${input.head ?? ''}
${styles === '' ? '' : `<style>\n${styles}\n</style>`}
</head>
<body>
${input.body}
${scripts}
</body>
</html>
`;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
