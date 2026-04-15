import { describe, expect, it } from 'vitest';
import { getMonacoLanguageIdFromPath } from '@/lsp/language-routing';
import { getLanguage } from './editor/editor-panel-shared';
import { langFromPath } from './vcs/vcs-utils';

const CASES = [
  '/workspace/src/App.tsx',
  '/workspace/src/index.jsx',
  '/workspace/src/main.py',
  '/workspace/config/settings.yaml',
  '/workspace/assets/logo.SVG',
  '/workspace/README',
];

describe('explorer language routing', () => {
  it.each(CASES)('keeps editor + diff inference aligned for %s', (path) => {
    const canonicalLanguage = getMonacoLanguageIdFromPath(path);

    expect(getLanguage(path)).toBe(canonicalLanguage);
    expect(langFromPath(path)).toBe(canonicalLanguage);
  });
});
