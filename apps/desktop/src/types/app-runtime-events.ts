/**
 * Event pushed from an app runtime to its own views in one workspace.
 *
 * Nothing is persisted. A window receives an event only while it subscribes to
 * that app, workspace and topic.
 */
export interface AppRuntimeEvent {
  appId: string;
  workspaceId: string;
  topic: string;
  payload: unknown;
}
