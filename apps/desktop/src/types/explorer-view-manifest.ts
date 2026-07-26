/** Explorer view contribution declared in an app manifest (`sero.app.explorerView`). */
export interface ExplorerViewManifest {
  /** Exported component name from the module federation remote (e.g. "GitExplorerView"). */
  component: string;
  /** Activity-bar label. Defaults to the app's name. */
  label?: string;
  /** Lucide icon name for the activity bar. Defaults to the app's icon. */
  icon?: string;
}
