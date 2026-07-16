import type { Plugin } from 'vite';

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const GLOBAL_SELECTOR_PATTERN = /(^|[},])\s*(?::root|html|body)(?=[\s.#:[>,{])/m;
const SCOPE_MARKER = '/* sero-plugin-css-scope */';

export interface SeroPluginCssScopeOptions {
  pluginId: string;
  /** Temporary migration escape hatch for legacy global selectors. */
  allowGlobalSelectors?: boolean;
}

export function scopePluginCss(css: string, options: SeroPluginCssScopeOptions): string {
  validatePluginId(options.pluginId);
  if (css.includes(SCOPE_MARKER)) return css;
  if (!options.allowGlobalSelectors && GLOBAL_SELECTOR_PATTERN.test(stripCssComments(css))) {
    throw new Error(
      `[sero-plugin-css] ${options.pluginId} contains a :root, html, or body selector. ` +
      'Move shared theme rules to the host or plugin variables to :scope.',
    );
  }

  const pluginId = cssString(options.pluginId);
  return `${SCOPE_MARKER}\n@scope ([data-sero-plugin="${pluginId}"]) to ([data-sero-plugin]) {\n${css}\n}\n`;
}

/**
 * Scopes CSS in Vite's transform pipeline. Place it after Tailwind in the
 * plugin list so the same hook handles dev/HMR and production chunks.
 */
export function seroPluginCssScope(options: SeroPluginCssScopeOptions): Plugin {
  validatePluginId(options.pluginId);
  return {
    name: 'sero-plugin-css-scope',
    transform(code, id) {
      const cleanId = id.split('?', 1)[0];
      if (!cleanId.endsWith('.css')) return null;
      const scoped = scopePluginCss(code, options);
      return { code: scoped, map: null };
    },
    generateBundle(_, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== 'asset' || !asset.fileName.endsWith('.css')) continue;
        const source = typeof asset.source === 'string'
          ? asset.source
          : new TextDecoder().decode(asset.source);
        const expectedScope = `@scope ([data-sero-plugin="${cssString(options.pluginId)}"])`;
        if (!source.includes(expectedScope)) {
          this.error(`[sero-plugin-css] Emitted CSS asset ${asset.fileName} is not scoped.`);
        }
      }
    },
  };
}

function validatePluginId(pluginId: string): void {
  if (!PLUGIN_ID_PATTERN.test(pluginId)) {
    throw new Error(`[sero-plugin-css] Invalid plugin ID "${pluginId}".`);
  }
}

function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function cssString(value: string): string {
  return value.replace(/["\\\n\r\f]/g, (character) => {
    if (character === '"' || character === '\\') return `\\${character}`;
    return `\\${character.codePointAt(0)?.toString(16)} `;
  });
}
