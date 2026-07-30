import { CSS_VARIABLE_PATTERN } from '../../shared/tweaks';
import type { PreviewDocumentInput } from '../preview/document';
import { escapeHtml } from '../preview/document';
import { REDUCED_MOTION_CSS } from './motion';

/** Local files and data only. The exported page has no Sero authority. */
export const EXPORT_CSP = [
  "default-src 'self' data: blob:",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob:",
  "connect-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
].join('; ');

function inlineScript(code: string): string {
  return code.replace(/<\/script/gi, '<\\/script').replace(/<!--/g, '<\\!--');
}

function inlineStyle(css: string): string {
  return css.replace(/<\/style/gi, '<\\/style');
}

function rootStyle(variables: Readonly<Record<string, string>>): string {
  const declarations: string[] = [];
  for (const [name, value] of Object.entries(variables)) {
    if (CSS_VARIABLE_PATTERN.test(name)) declarations.push(`${name}: ${value}`);
  }
  return declarations.join('; ');
}

/** Assemble a runnable document with no preview harness or Tweaks channel. */
export function assembleStandaloneDocument(input: PreviewDocumentInput): string {
  const styles = [...input.styles, REDUCED_MOTION_CSS]
    .flatMap((style) => style.trim() === '' ? [] : [inlineStyle(style)])
    .join('\n\n');
  const scripts = input.scripts
    .flatMap((script) =>
      script.trim() === '' ? [] : [`<script>\n${inlineScript(script)}\n</script>`],
    )
    .join('\n');
  const rootVariables = rootStyle(input.rootVariables ?? {});

  return `<!doctype html>
<html lang="en"${rootVariables === '' ? '' : ` style="${escapeHtml(rootVariables)}"`}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${EXPORT_CSP}">
<title>${escapeHtml(input.title)}</title>
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
