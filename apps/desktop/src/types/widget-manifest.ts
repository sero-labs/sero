/** Widget definition shared between app manifests and dashboard runtime state. */
export interface WidgetManifest {
  /** Unique widget identifier within the app (e.g. "board-summary"). */
  id: string;
  /** Display name shown in UI pickers and widget headers. */
  name: string;
  /** Exported component name from the module federation remote. */
  component: string;
  /** Default grid size (react-grid-layout units). */
  defaultSize: { w: number; h: number };
  /** Minimum grid size. */
  minSize?: { w: number; h: number };
  /** Maximum grid size. */
  maxSize?: { w: number; h: number };
  /** Optional short description for the widget picker. */
  description?: string;
}
