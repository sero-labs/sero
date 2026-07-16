import postcss, { type Rule } from 'postcss';
import selectorParser from 'postcss-selector-parser';
import type { Plugin } from 'vite';

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const SCOPE_MARKER = 'sero-plugin-css-scope';

export interface SeroPluginCssScopeOptions {
  pluginId: string;
  /**
   * @deprecated No longer used. Document-level selectors (`:root`/`:host`/
   * `html`/`body`) are rewritten to `:scope` automatically, so plugins never
   * need an escape hatch. Kept only so existing configs keep type-checking.
   */
  allowGlobalSelectors?: boolean;
}

/**
 * Wraps plugin CSS in a bounded native `@scope` and rewrites document-level
 * selectors to `:scope`. Returns the scoped CSS as a string (no source map);
 * the Vite plugin uses the map-producing path internally.
 */
export function scopePluginCss(css: string, options: SeroPluginCssScopeOptions): string {
  return runScope(css, options).code;
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
      const { code: scoped, map } = runScope(code, options, id);
      return { code: scoped, map: map ?? undefined };
    },
    generateBundle(_, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type !== 'asset' || !asset.fileName.endsWith('.css')) continue;
        const source = typeof asset.source === 'string'
          ? asset.source
          : new TextDecoder().decode(asset.source);
        if (!source.includes(`@scope ([data-sero-plugin="${cssString(options.pluginId)}"])`)) {
          this.error(`[sero-plugin-css] Emitted CSS asset ${asset.fileName} is not scoped.`);
        }
      }
    },
  };
}

interface ScopeResult {
  code: string;
  /** JSON source map string, or null when no map was requested. */
  map: string | null;
}

/**
 * Parses the CSS once so every rewrite only ever touches selectors and
 * at-rules — never declaration values, url()s, strings, or comments — and
 * produces a source map when a module id is supplied.
 */
function runScope(css: string, options: SeroPluginCssScopeOptions, from?: string): ScopeResult {
  validatePluginId(options.pluginId);
  if (css.includes(SCOPE_MARKER)) return { code: css, map: null };

  const result = postcss([scopeTransform(options)]).process(css, {
    from,
    map: from ? { inline: false, annotation: false } : false,
  });
  return { code: result.css, map: from ? result.map.toString() : null };
}

function scopeTransform(options: SeroPluginCssScopeOptions): postcss.Plugin {
  const params = `([data-sero-plugin="${cssString(options.pluginId)}"]) to ([data-sero-plugin])`;
  return {
    postcssPlugin: 'sero-plugin-css-scope',
    Once(root) {
      root.walkAtRules('import', (rule) => {
        throw rule.error(
          `[sero-plugin-css] ${options.pluginId} uses a runtime "@import" (${rule.params}). ` +
          'Native @scope cannot contain it without leaking styles to the shell — ' +
          'bundle the stylesheet or load fonts via a <link> tag instead.',
        );
      });

      root.walkRules((rule) => {
        if (isKeyframeSelector(rule)) return;
        rule.selector = rewriteSelector(rule.selector);
      });

      const scope = postcss.atRule({ name: 'scope', params });
      scope.append(root.nodes);
      root.removeAll();
      root.append(postcss.comment({ text: SCOPE_MARKER }));
      root.append(scope);
    },
  };
}

/**
 * `:root`/`:host` (theme-variable carriers) and `html`/`body` (preflight)
 * never match inside `@scope`, so rewrite them to `:scope` — the scope root —
 * keeping the plugin's default theme and resets self-contained.
 */
function rewriteSelector(selector: string): string {
  return selectorParser((selectors) => {
    selectors.walk((node) => {
      const isDocumentPseudo = node.type === 'pseudo' && (node.value === ':root' || node.value === ':host');
      const isDocumentTag = node.type === 'tag' && (node.value === 'html' || node.value === 'body');
      if (isDocumentPseudo || isDocumentTag) {
        node.replaceWith(selectorParser.pseudo({ value: ':scope' }));
      }
    });
  }).processSync(selector);
}

function isKeyframeSelector(rule: Rule): boolean {
  const parent = rule.parent;
  return parent?.type === 'atrule' && /keyframes$/i.test((parent as postcss.AtRule).name);
}

function validatePluginId(pluginId: string): void {
  if (!PLUGIN_ID_PATTERN.test(pluginId)) {
    throw new Error(`[sero-plugin-css] Invalid plugin ID "${pluginId}".`);
  }
}

function cssString(value: string): string {
  return value.replace(/["\\\n\r\f]/g, (character) => {
    if (character === '"' || character === '\\') return `\\${character}`;
    return `\\${character.codePointAt(0)?.toString(16)} `;
  });
}
