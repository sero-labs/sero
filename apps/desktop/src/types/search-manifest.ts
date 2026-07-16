/** Global-search panel contribution declared in an app manifest (`sero.app.search`). */
export interface SearchManifest {
  /** Exported component name from the module federation remote (e.g. "GraphifySearch"). */
  component: string;
  /** Optional short description shown in search entry points (e.g. the ⌘K item). */
  description?: string;
}
