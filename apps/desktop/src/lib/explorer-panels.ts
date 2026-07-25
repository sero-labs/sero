/**
 * Explorer panel ids — the activity bar's vocabulary.
 *
 * Built-in panels are a fixed list; apps contribute further panels by
 * declaring `sero.app.explorerView`, so an id is any string. A persisted id
 * whose contributing plugin is currently absent is kept rather than reset —
 * the view comes back when the plugin does (AD-025).
 */

export const BUILTIN_EXPLORER_PANELS = [
  'explorer',
  'git',
  'orchestration',
  'browser',
  'terminal',
] as const;

export type BuiltinExplorerPanel = (typeof BUILTIN_EXPLORER_PANELS)[number];

/** A built-in panel id, or the id of an app-contributed Explorer view. */
export type ExplorerPanel = string;

const builtins = new Set<string>(BUILTIN_EXPLORER_PANELS);

export function isBuiltinExplorerPanel(value: unknown): value is BuiltinExplorerPanel {
  return typeof value === 'string' && builtins.has(value);
}

/**
 * True for panels that fill the whole Explorer area, leaving no room for the
 * host sidebar: the browser, and every app-contributed view.
 */
export function panelOwnsMainArea(panel: ExplorerPanel): boolean {
  return panel === 'browser' || !isBuiltinExplorerPanel(panel);
}
