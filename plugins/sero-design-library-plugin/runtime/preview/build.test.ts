import { describe, expect, it, vi } from 'vitest';
import {
  buildHtmlPreview,
  buildReactPreview,
  disallowedImports,
  extractClassCandidates,
} from './build';
import type { TweakManifest } from '../../shared/tweak-types';

const manifest: TweakManifest = { schemaVersion: 1, variantRevisionId: 'rev-1', controls: [] };

describe('buildHtmlPreview', () => {
  it('assembles the generated files into one runnable document', () => {
    const result = buildHtmlPreview({
      title: 'Ledger',
      files: [
        { path: 'body.html', contents: '<main>Hello</main>' },
        { path: 'styles.css', contents: ':root { --gap: 1rem; }' },
        { path: 'app.js', contents: 'console.log(1)' },
      ],
      assets: [],
      manifest,
    });

    expect(result.html).toContain('<main>Hello</main>');
    expect(result.html).toContain('--gap: 1rem;');
    expect(result.html).toContain('console.log(1)');
    expect(result.warnings).toEqual([]);
  });
});

describe('disallowedImports', () => {
  it('accepts only the approved bundle', () => {
    const source = `import { useState } from 'react';
import { Sparkle } from 'lucide-react';
import { local } from './local';`;
    expect(disallowedImports(source)).toEqual([]);
  });

  it('reports anything outside the approved bundle', () => {
    const source = `import axios from 'axios';
import styled from 'styled-components';`;
    expect(disallowedImports(source).sort()).toEqual(['axios', 'styled-components']);
  });
});

describe('extractClassCandidates', () => {
  it('collects the Tailwind classes the design actually uses', () => {
    const source = '<div className="flex gap-4 text-sm"><span class="font-mono">x</span></div>';
    expect(extractClassCandidates(source).sort()).toEqual([
      'flex',
      'font-mono',
      'gap-4',
      'text-sm',
    ]);
  });
});

describe('buildReactPreview', () => {
  const deps = {
    resolveDir: '/plugin',
    esbuild: { build: vi.fn().mockResolvedValue({ outputFiles: [{ text: 'var App = 1;' }] }) },
    tailwind: {
      compile: vi.fn().mockResolvedValue({ build: () => '.flex{display:flex}' }),
    },
  };

  it('compiles locally and mounts the generated component', async () => {
    const result = await buildReactPreview({
      title: 'React design',
      files: [
        { path: 'App.tsx', contents: 'export default function App(){return <div className="flex"/>}' },
        { path: 'styles.css', contents: ':root { --gap: 1rem; }' },
      ],
      assets: [],
      manifest,
    }, deps);

    expect(result.html).toContain('<div id="root"></div>');
    expect(result.html).toContain('.flex{display:flex}');
    expect(result.html).toContain('var App = 1;');
    expect(deps.esbuild.build).toHaveBeenCalled();
    const options = deps.esbuild.build.mock.calls[0][0] as Record<string, unknown>;
    expect(options.bundle).toBe(true);
    expect(options.jsx).toBe('automatic');
  });

  it('warns when the generated code reaches outside the approved bundle', async () => {
    const result = await buildReactPreview({
      title: 'React design',
      files: [
        { path: 'App.tsx', contents: "import axios from 'axios'; export default () => null;" },
        { path: 'styles.css', contents: '' },
      ],
      assets: [],
      manifest,
    }, deps);

    expect(result.warnings[0]).toContain('axios');
  });
});
