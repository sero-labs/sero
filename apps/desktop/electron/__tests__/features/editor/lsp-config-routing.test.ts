import { describe, expect, it } from 'vitest';
import { findConfigByLanguageId } from '@electron/features/editor/lsp/types';
import {
  LSP_LANGUAGE_ID_BY_EXTENSION,
  LSP_SERVER_LANGUAGE_BY_MONACO_ID,
} from '@/lsp/language-routing';

function expectedLanguageIdMapForServer(serverLanguage: string): Record<string, string> {
  return Object.fromEntries(
    Object.entries(LSP_LANGUAGE_ID_BY_EXTENSION).filter(
      ([, languageId]) => LSP_SERVER_LANGUAGE_BY_MONACO_ID[languageId] === serverLanguage,
    ),
  );
}

describe('lsp server config routing', () => {
  it('derives typescript server metadata from canonical shared routing contracts', () => {
    const expectedLanguageIdMap = expectedLanguageIdMapForServer('typescript');
    const expectedMonacoLanguageIds = Array.from(new Set(Object.values(expectedLanguageIdMap)));
    const expectedExtensions = Object.keys(expectedLanguageIdMap);

    const config = findConfigByLanguageId('typescript');
    expect(config).toBeDefined();
    expect(config?.language).toBe('typescript');
    expect(config?.languageIdMap).toEqual(expectedLanguageIdMap);
    expect(config?.monacoLanguageIds).toEqual(expectedMonacoLanguageIds);
    expect(config?.extensions).toEqual(expectedExtensions);
  });

  it('resolves each canonical monaco id to the shared typescript server config', () => {
    const expectedMonacoLanguageIds = Array.from(
      new Set(
        Object.values(expectedLanguageIdMapForServer('typescript')),
      ),
    );

    for (const languageId of expectedMonacoLanguageIds) {
      const config = findConfigByLanguageId(languageId);
      expect(config?.language).toBe('typescript');
    }

    expect(findConfigByLanguageId('markdown')).toBeUndefined();
  });
});
