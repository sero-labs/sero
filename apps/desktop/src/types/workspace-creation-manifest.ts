/** Option contributed to the new-workspace form through `sero.app.workspaceCreation`. */
export interface WorkspaceCreationManifest {
  /** Text shown next to the option switch. */
  label: string;
  /** Initial switch state. Defaults to false. */
  defaultEnabled?: boolean;
  /** App-local extension tool invoked after the workspace is created. */
  tool: string;
  /** Static tool arguments merged with the new workspace context. */
  params?: Record<string, unknown>;
}
