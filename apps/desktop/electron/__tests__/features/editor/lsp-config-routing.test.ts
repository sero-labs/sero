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
    expect(config?.command).toContain('PATH="$LSP_NPM_PREFIX/bin:$LSP_NPM_PREFIX:$LSP_NPM_PREFIX/node_modules/.bin:$PATH"');
    expect(config?.command).toContain('$LSP_NPM_PREFIX/node_modules/typescript-language-server/lib/cli.mjs');
    expect(config?.command).toContain('exec node "$cli" --stdio');
    expect(config?.command).toContain('command -v typescript-language-server.cmd');
    expect(config?.command).toContain('exec "$server" --stdio');
    expect(config?.checkCommand).toContain('test -n "$cli" || command -v typescript-language-server');
    expect(config?.checkCommand).toContain('command -v typescript-language-server.cmd');
    expect(config?.installCommand).toBe('LSP_NPM_PREFIX="${HOME:-/tmp/sero-home}/.sero/lsp/npm"; mkdir -p "$LSP_NPM_PREFIX" && npm install -g --prefix "$LSP_NPM_PREFIX" typescript-language-server@4.4.0 typescript@5.9.3');
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
