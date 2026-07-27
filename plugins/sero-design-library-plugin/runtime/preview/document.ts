import { PREVIEW_CSP, PREVIEW_HARNESS } from './harness';

/**
 * Assembling the one file a preview runs from.
 *
 * Self-contained is not a nicety here: the frame has no network, and an export
 * has to run from a folder on someone's disk (spec §6.3, §7). So everything —
 * the policy, the harness, the styles, the script — is inlined into a single
 * document, and nothing in it references anything outside itself.
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
}

/**
 * The harness goes in `<head>`, ahead of everything the page brings with it. A
 * guard installed after generated code has already run is not a guard: a script
 * at the top of `<body>` would have called `fetch` before it was replaced.
 */
export function assemblePreviewDocument(input: PreviewDocumentInput): string {
  const styles = input.styles
    .filter((style) => style.trim() !== '')
    .map((style) => forInlineStyle(style))
    .join('\n\n');

  const scripts = input.scripts
    .filter((script) => script.trim() !== '')
    .map((script) => `<script>\n${forInlineScript(script)}\n</script>`)
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">
<title>${escapeHtml(input.title)}</title>
<script>
${forInlineScript(PREVIEW_HARNESS)}
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
