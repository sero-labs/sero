import { describe, expect, it } from 'vitest';

import { PREVIEW_CSP } from '../preview/harness';
import { buildHtmlDocument } from './html';

/**
 * The HTML target folds a small file tree into one document. What matters is that
 * nothing survives that would need the network, and that anything removed is
 * reported rather than quietly dropped.
 */

const PAGE = `<!doctype html>
<html><head>
<title>Signal ledger</title>
<link rel="stylesheet" href="styles.css">
</head>
<body><main>Hello</main><script src="script.js"></script></body></html>`;

describe('assembling an HTML design', () => {
  it('inlines the linked stylesheet and script', () => {
    const built = buildHtmlDocument([
      { name: 'index.html', content: PAGE },
      { name: 'styles.css', content: 'main { color: red }' },
      { name: 'script.js', content: 'document.title = "set"' },
    ]);

    expect(built.warnings).toEqual([]);
    expect(built.document).toContain('main { color: red }');
    expect(built.document).toContain('document.title = "set"');
    // No path is left for the frame to resolve — it has no origin to resolve
    // one against, so a surviving reference would simply never load.
    expect(built.document).not.toContain('href="styles.css"');
    expect(built.document).not.toContain('src="script.js"');
    expect(built.document).toContain('<title>Signal ledger</title>');
  });

  it('carries the policy and installs the harness before any generated code', () => {
    const built = buildHtmlDocument([
      { name: 'index.html', content: '<body><script>window.ran = true</script></body>' },
    ]);

    expect(built.document).toContain(PREVIEW_CSP);
    // A guard installed after generated code has already run is not a guard.
    const harnessAt = built.document!.indexOf('sero-design-preview');
    const generatedAt = built.document!.indexOf('window.ran');
    expect(harnessAt).toBeGreaterThan(-1);
    expect(harnessAt).toBeLessThan(generatedAt);
  });

  it('removes a remote stylesheet and script, and says so', () => {
    const built = buildHtmlDocument([
      {
        name: 'index.html',
        content: `<head><link rel="stylesheet" href="https://fonts.example/x.css"></head><body><script src="//cdn.example/y.js"></script></body>`,
      },
    ]);

    expect(built.document).not.toContain('fonts.example');
    expect(built.document).not.toContain('cdn.example');
    expect(built.warnings.join(' ')).toContain('fonts.example');
    expect(built.warnings.join(' ')).toContain('cdn.example');
  });

  it('reports a remote image left in the markup', () => {
    const built = buildHtmlDocument([
      { name: 'index.html', content: '<body><img src="https://images.example/hero.png"></body>' },
    ]);

    // The tag stays — removing it would change the layout — but the frame will
    // block it, so the warning has to exist or the gap is unexplained.
    expect(built.warnings.join(' ')).toContain('images.example');
  });

  it('does not mistake an SVG namespace for a network reference', () => {
    const built = buildHtmlDocument([
      {
        name: 'index.html',
        content: '<body><svg xmlns="http://www.w3.org/2000/svg"><rect/></svg></body>',
      },
    ]);

    expect(built.warnings).toEqual([]);
  });

  it('reports a link to a file that was never written', () => {
    const built = buildHtmlDocument([
      { name: 'index.html', content: '<head><link rel="stylesheet" href="theme.css"></head><body>x</body>' },
    ]);

    expect(built.warnings.join(' ')).toContain('theme.css');
    expect(built.document).toBeDefined();
  });

  it('inlines a file the page forgot to reference', () => {
    const built = buildHtmlDocument([
      { name: 'index.html', content: '<body>x</body>' },
      { name: 'styles.css', content: 'body { margin: 0 }' },
    ]);

    // The missing link is the mistake, not the file. Dropping it would leave an
    // unstyled page with nothing to explain it.
    expect(built.document).toContain('body { margin: 0 }');
    expect(built.warnings.join(' ')).toContain('not linked');
  });

  it('keeps inline styles the model put in its own head', () => {
    const built = buildHtmlDocument([
      { name: 'index.html', content: '<head><style>:root { --a: 1 }</style></head><body>x</body>' },
    ]);

    expect(built.document).toContain('--a: 1');
  });

  it('treats a bare fragment as the body', () => {
    const built = buildHtmlDocument([{ name: 'index.html', content: '<main>Just markup</main>' }]);

    expect(built.document).toContain('<main>Just markup</main>');
    expect(built.document).toContain('<!doctype html>');
  });

  it('will not let inlined code close the script tag early', () => {
    const built = buildHtmlDocument([
      { name: 'index.html', content: '<body>x</body>' },
      { name: 'script.js', content: 'const s = "</script><img src=x onerror=alert(1)>";' },
    ]);

    // Left unescaped this ends the block and injects markup into the document.
    expect(built.document).not.toContain('</script><img');
    expect(built.document).toContain('<\\/script>');
  });

  it('produces nothing at all without an entry point', () => {
    const built = buildHtmlDocument([{ name: 'styles.css', content: 'body{}' }]);

    // A warning must never stand in for a page that does not exist.
    expect(built.document).toBeUndefined();
    expect(built.warnings.join(' ')).toContain('index.html');
  });
});
