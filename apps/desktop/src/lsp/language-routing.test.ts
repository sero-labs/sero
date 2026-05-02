import { describe, expect, it } from 'vitest';
import {
  LSP_PROVIDER_LANGUAGE_IDS,
  getLspLanguageIdFromPath,
  getLspServerLanguage,
  getMonacoLanguageIdFromPath,
} from './language-routing';

describe('language-routing', () => {
  it('maps ts/js families to LSP server language ids and provider registration ids', () => {
    expect(LSP_PROVIDER_LANGUAGE_IDS).toEqual([
      'typescript',
      'typescriptreact',
      'javascript',
      'javascriptreact',
    ]);

    expect(getLspServerLanguage('typescript')).toBe('typescript');
    expect(getLspServerLanguage('javascriptreact')).toBe('typescript');
    expect(getLspServerLanguage('markdown')).toBeNull();

    expect(getLspLanguageIdFromPath('/workspace/src/App.tsx')).toBe('typescriptreact');
    expect(getLspLanguageIdFromPath('/workspace/src/app.mjs')).toBe('javascript');
    expect(getLspLanguageIdFromPath('/workspace/docs/readme.md')).toBe('plaintext');
  });

  it('maps editor and diff previews through the shared monaco language map', () => {
    expect(getMonacoLanguageIdFromPath('/workspace/src/App.tsx')).toBe('typescript');
    expect(getMonacoLanguageIdFromPath('/workspace/src/app.jsx')).toBe('javascript');
    expect(getMonacoLanguageIdFromPath('/workspace/config/settings.yaml')).toBe('yaml');
    expect(getMonacoLanguageIdFromPath('/workspace/assets/logo.SVG')).toBe('xml');
    expect(getMonacoLanguageIdFromPath('/workspace/README')).toBe('plaintext');
  });
});
