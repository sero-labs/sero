/** Option contributed to workspace creation, clone, and import forms. */
export interface WorkspaceCreationManifest {
  /** Text shown next to the option switch. */
  label: string;
  /** Initial switch state. Defaults to false. */
  defaultEnabled?: boolean;
  /** App-local extension tool invoked after the workspace is added. */
  tool: string;
  /** Static tool arguments merged with the workspace context. */
  params?: Record<string, unknown>;
}
