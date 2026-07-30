import { describe, expect, it } from 'vitest';

import { buildStandaloneDocument } from './index';
import { EXPORT_CSP } from './standalone';

describe('standalone document build', () => {
  it('builds HTML without the Sero preview or Tweaks runtime', async () => {
    const built = await buildStandaloneDocument('html', [
      {
        name: 'index.html',
        content: '<body><style>:root { --size: 12px; }</style><h1>Saved output</h1></body>',
      },
    ], [], { '--size': '42px' });

    expect(built.document).toContain('Saved output');
    expect(built.document).toContain('<html lang="en" style="--size: 42px">');
    expect(built.document).toContain(':root { --size: 12px; }');
    expect(built.document).toContain(EXPORT_CSP);
    expect(built.document).toContain('prefers-reduced-motion: reduce');
    expect(built.document).not.toContain('sero-design-preview');
    expect(built.document).not.toContain("window.addEventListener('message'");
  });

  it('bundles React and Tailwind with saved Tweaks on the root element', async () => {
    const built = await buildStandaloneDocument('react', [
      {
        name: 'App.tsx',
        content: 'export default function App(){return <main className="p-8">Standalone React</main>}',
      },
      { name: 'styles.css', content: ':root { --signal: #000000; }' },
    ], [], { '--signal': '#ff0000' });

    expect(built.warnings).toEqual([]);
    expect(built.document).toContain('Standalone React');
    expect(built.document).toContain('createRoot');
    expect(built.document).toContain('text/tailwindcss');
    expect(built.document).toContain('<html lang="en" style="--signal: #ff0000">');
    expect(built.document).toContain(':root { --signal: #000000; }');
    expect(built.document).not.toContain('sero-design-preview');
  });
});
