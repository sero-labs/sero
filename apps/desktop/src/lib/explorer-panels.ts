/**
 * Explorer panel ids — the activity bar's vocabulary.
 *
 * Built-in panels are a fixed list; apps contribute further panels by
 * contributing to `ui.explorer.view`, so an id is any string. A persisted id
 * whose contributing plugin is currently absent is kept rather than reset —
 * the view comes back when the plugin does (AD-025).
 */

export const BUILTIN_EXPLORER_PANELS = [
  'explorer',
  'orchestration',
  'browser',
  'terminal',
] as const;

export type BuiltinExplorerPanel = (typeof BUILTIN_EXPLORER_PANELS)[number];

/** A built-in panel id, or the stable key of an app-contributed Explorer view. */
export type ExplorerPanel = string;

const builtins = new Set<string>(BUILTIN_EXPLORER_PANELS);

export function isBuiltinExplorerPanel(value: unknown): value is BuiltinExplorerPanel {
  return typeof value === 'string' && builtins.has(value);
}

interface ExplorerContributionIdentity {
  key: string;
  appId: string;
}

/** Accept the legacy app id when that app contributes exactly one Explorer view. */
export function resolveExplorerPanelId(
  panel: ExplorerPanel,
  contributions: ExplorerContributionIdentity[],
): ExplorerPanel {
  let legacyMatch: string | undefined;
  for (const contribution of contributions) {
    if (contribution.key === panel) return panel;
    if (contribution.appId !== panel) continue;
    if (legacyMatch) return panel;
    legacyMatch = contribution.key;
  }
  return legacyMatch ?? panel;
}

/** Return the contributing app id, or an unchanged host panel id. */
export function explorerPanelAppId(panel: ExplorerPanel): string {
  const separatorIndex = panel.indexOf(':');
  return separatorIndex === -1 ? panel : panel.slice(0, separatorIndex);
}

/**
 * True for panels that fill the whole Explorer area, leaving no room for the
 * host sidebar: the browser, and every app-contributed view.
 */
export function panelOwnsMainArea(panel: ExplorerPanel): boolean {
  return panel === 'browser' || !isBuiltinExplorerPanel(panel);
}
