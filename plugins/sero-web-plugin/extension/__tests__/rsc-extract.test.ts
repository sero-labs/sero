import { describe, expect, it } from 'vitest';
import { extractRSCContent } from '../rsc-extract';

function buildRscHtml(node: unknown): string {
  const payload = `23:${JSON.stringify(node)}`;
  const escaped = JSON.stringify(payload).slice(1, -1);
  return [
    '<html>',
    '<head><title>Guide | Sero</title></head>',
    `<body><script>self.__next_f.push([1,"${escaped}"])</script></body>`,
    '</html>',
  ].join('');
}

describe('RSC extraction', () => {
  it('converts main RSC content into readable markdown', () => {
    const html = buildRscHtml([
      '$',
      'div',
      null,
      {
        children: [
          ['$', 'h1', null, { children: 'Overview' }],
          ['$', 'p', null, {
            children: 'This paragraph is intentionally long so the main chunk passes the content threshold and exercises the markdown conversion path without relying on the fallback collector.',
          }],
          ['$', 'a', null, { href: 'https://sero.dev/docs', children: 'Docs' }],
          ['$', 'table', null, {
            children: ['$', 'tbody', null, {
              children: [
                ['$', 'tr', null, { children: [
                  ['$', 'th', null, { children: 'Name' }],
                  ['$', 'th', null, { children: 'Value' }],
                ] }],
                ['$', 'tr', null, { children: [
                  ['$', 'td', null, { children: 'Mode' }],
                  ['$', 'td', null, { children: 'Focused' }],
                ] }],
              ],
            }],
          }],
        ],
      },
    ]);

    const result = extractRSCContent(html);

    expect(result).toEqual({
      title: 'Guide',
      content: [
        '# Overview',
        '',
        'This paragraph is intentionally long so the main chunk passes the content threshold and exercises the markdown conversion path without relying on the fallback collector.',
        '',
        '[Docs](https://sero.dev/docs)| Name | Value |',
        '| --- | --- |',
        '| Mode | Focused |',
      ].join('\n'),
    });
  });
});
