import type { Plugin } from 'vite';

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
const SCOPE_MARKER = '/* sero-plugin-css-scope */';

// `:root` / `:host` inside an `@scope` block match nothing — both are
// ancestors of (never descendants of) the scope root — so any variables a
// plugin's own Tailwind emits there would silently vanish. Rewrite them to
// `:scope` (the scope root itself) so a plugin's default theme is
// self-contained. The negative lookaheads avoid `:root-…`, `:host(…)`, and
// `:host-context` forms.
const ROOT_SELECTOR_PATTERN = /:root(?![\w-])/g;
const HOST_SELECTOR_PATTERN = /:host(?![\w(-])/g;

// `@charset` / `@import` are only valid before any style rule, so they cannot
// live inside the `@scope` wrapper. Match leading ones (the only legal place)
// and hoist them out. Best-effort: a `;` inside a url() string would end the
// match early, but real font imports (`@import url("https://…");`) have none.
const LEADING_AT_RULE_PATTERN = /^\s*(@(?:charset|import)\b[^;]*;)/i;

export interface SeroPluginCssScopeOptions {
  pluginId: string;
  /**
   * @deprecated No longer used. Document-level selectors (`:root`/`:host`) are
   * now rewritten to `:scope` automatically, so plugins never need an escape
   * hatch. Kept only so existing configs keep type-checking.
   */
  allowGlobalSelectors?: boolean;
}

export function scopePluginCss(css: string, options: SeroPluginCssScopeOptions): string {
  validatePluginId(options.pluginId);
  if (css.includes(SCOPE_MARKER)) return css;

  const { hoisted, rest } = hoistLeadingAtRules(css);
  const scopedBody = scopeDocumentSelectors(rest);
  const pluginId = cssString(options.pluginId);
  // Hoisted `@charset`/`@import` must precede everything, including the marker
  // comment, so `@charset` stays at byte 0 when present.
  const prefix = hoisted ? `${hoisted}\n` : '';
  return `${prefix}${SCOPE_MARKER}\n@scope ([data-sero-plugin="${pluginId}"]) to ([data-sero-plugin]) {\n${scopedBody}\n}\n`;
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

function scopeDocumentSelectors(css: string): string {
  return css.replace(ROOT_SELECTOR_PATTERN, ':scope').replace(HOST_SELECTOR_PATTERN, ':scope');
}

function hoistLeadingAtRules(css: string): { hoisted: string; rest: string } {
  const leading: string[] = [];
  let rest = css;
  let match = rest.match(LEADING_AT_RULE_PATTERN);
  while (match) {
    leading.push(match[1]);
    rest = rest.slice(match[0].length);
    match = rest.match(LEADING_AT_RULE_PATTERN);
  }
  return { hoisted: leading.join('\n'), rest };
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
