import { describe, expect, it } from 'vitest';
import { buildExtractPageScript, buildScrollPageScript } from '@electron/features/browser/page-scripts';

/**
 * These scripts are strings evaluated inside a page via
 * `webContents.executeJavaScript`. They are authored as template literals,
 * so any escape sequence has to survive being turned into a string once
 * before the page parses it. A bare '\n' inside a quoted string in the
 * template literal becomes a real newline in the emitted script — an
 * unterminated string literal — which makes executeJavaScript reject and
 * the caller see "extraction returned nothing" (issue #247).
 *
 * `new Function` parses the source the same way the page's JS engine does,
 * so it catches that class of bug without needing a real browser.
 */
function parse(script: string): void {
  // Throws SyntaxError if the emitted script is not valid JS.
  new Function(`return (${script});`);
}

/** Evaluate the extract script against a mock DOM and return its result. */
function runExtract(innerText: string): { title: string; url: string; text: string } {
  const doc = {
    title: 'Example',
    body: { cloneNode: () => ({ querySelectorAll: () => [], innerText }) },
  };
  const loc = { href: 'https://example.com/' };
  return new Function('document', 'location', `return (${buildExtractPageScript()});`)(doc, loc);
}

describe('buildExtractPageScript', () => {
  it('emits syntactically valid JavaScript', () => {
    expect(() => parse(buildExtractPageScript())).not.toThrow();
  });

  it('splits and collapses on real newlines', () => {
    const result = runExtract('One\n\n\n  Two  \nThree');
    expect(result).toEqual({
      title: 'Example',
      url: 'https://example.com/',
      text: 'One\n\nTwo\nThree',
    });
  });
});

describe('buildScrollPageScript', () => {
  it('emits syntactically valid JavaScript', () => {
    expect(() => parse(buildScrollPageScript(800))).not.toThrow();
  });
});
