import { describe, expect, it } from 'vitest';

import { PREVIEW_CSP } from '../preview/harness';
import { buildReactDocument } from './react';

/**
 * The React target runs the real bundler against React from the plugin's own
 * dependencies — a stub here would prove nothing about the thing that actually
 * has to resolve. Tailwind's compiler is replaced, because inlining 260 KB into
 * every fixture buys no coverage.
 */

const tailwindRuntime = async () => '/* tailwind stub */';

const APP = `export default function App() {
  return <main className="p-8 text-lg">Operational field</main>;
}
`;

describe('bundling a React design', () => {
  it('compiles the page and mounts it into the document', async () => {
    const built = await buildReactDocument([{ name: 'App.tsx', content: APP }], {
      tailwindRuntime,
    });

    expect(built.warnings).toEqual([]);
    expect(built.document).toContain('Operational field');
    expect(built.document).toContain('<div id="root"></div>');
    expect(built.document).toContain(PREVIEW_CSP);
    // The compiler has to be in the document ahead of the page, or the first
    // paint has no stylesheet.
    expect(built.document!.indexOf('tailwind stub')).toBeLessThan(
      built.document!.indexOf('Operational field'),
    );
  });

  it('bundles a relative import between two emitted files', async () => {
    const built = await buildReactDocument(
      [
        { name: 'App.tsx', content: `import { Panel } from './Panel';\nexport default function App() { return <Panel />; }` },
        { name: 'Panel.tsx', content: `export function Panel() { return <section>Throughput</section>; }` },
      ],
      { tailwindRuntime },
    );

    expect(built.warnings).toEqual([]);
    expect(built.document).toContain('Throughput');
  });

  it('refuses an import outside the approved set but still renders the page', async () => {
    const built = await buildReactDocument(
      [
        {
          name: 'App.tsx',
          content: `import axios from 'axios';\nexport default function App() { return <main>{typeof axios}</main>; }`,
        },
      ],
      { tailwindRuntime },
    );

    expect(built.warnings.join(' ')).toContain('axios');
    // Refusing the import must not cost the whole page: the remaining safe
    // output still renders, which is the behaviour the spec asks for.
    expect(built.document).toBeDefined();
    // And the module must be genuinely absent rather than stubbed into
    // something that behaves as though the import worked.
    expect(built.document).not.toContain('axios/lib');
    expect(built.document).toContain('module.exports = {}');
  });

  it('reports a relative import naming a file that was never written', async () => {
    const built = await buildReactDocument(
      [
        {
          name: 'App.tsx',
          content: `import { Missing } from './Missing';\nexport default function App() { return <main>{String(Missing)}</main>; }`,
        },
      ],
      { tailwindRuntime },
    );

    expect(built.warnings.join(' ')).toContain('./Missing');
    expect(built.document).toBeDefined();
  });

  it('produces nothing when the design does not compile', async () => {
    const built = await buildReactDocument(
      [{ name: 'App.tsx', content: 'export default function App() { return <main>unclosed' }],
      { tailwindRuntime },
    );

    // A syntax error leaves no page, so the variant has to fail rather than show
    // an empty frame with a warning beside it.
    expect(built.document).toBeUndefined();
    expect(built.warnings.join(' ')).toContain('Could not compile');
  });

  it('produces nothing without an entry point', async () => {
    const built = await buildReactDocument([{ name: 'Panel.tsx', content: 'export const x = 1;' }], {
      tailwindRuntime,
    });

    expect(built.document).toBeUndefined();
    expect(built.warnings.join(' ')).toContain('App.tsx');
  });

  it('hands an emitted stylesheet to Tailwind rather than the bundler', async () => {
    const built = await buildReactDocument(
      [
        { name: 'App.tsx', content: `import './theme.css';\n${APP}` },
        { name: 'theme.css', content: '@theme { --color-signal: #34d399; }' },
      ],
      { tailwindRuntime },
    );

    expect(built.warnings).toEqual([]);
    // `@theme` is Tailwind syntax, not CSS the bundler could do anything with.
    expect(built.document).toContain('type="text/tailwindcss"');
    expect(built.document).toContain('--color-signal: #34d399');
  });

  it('imports React itself from the plugin, not from a stub', async () => {
    const built = await buildReactDocument(
      [
        {
          name: 'App.tsx',
          content: `import { useState } from 'react';
export default function App() {
  const [n, set] = useState(0);
  return <button onClick={() => set(n + 1)}>{n}</button>;
}`,
        },
      ],
      { tailwindRuntime },
    );

    expect(built.warnings).toEqual([]);
    // A real React build is in there: the production runtime, not a shim.
    expect(built.document).toContain('createRoot');
    expect(built.document!.length).toBeGreaterThan(50_000);
  });

  it('inlines the real Tailwind compiler when it is not stubbed out', async () => {
    const built = await buildReactDocument([{ name: 'App.tsx', content: APP }]);

    expect(built.warnings).toEqual([]);
    // Proves the dependency resolves and travels with the page; the frame has no
    // network, so a missing compiler means no utility classes at all.
    expect(built.document).toContain('text/tailwindcss');
    expect(built.document!.length).toBeGreaterThan(250_000);
  });
});
