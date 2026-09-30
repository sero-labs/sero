/**
 * An app runtime pushing an event to its own views.
 *
 * Delivery is scoped to the app that emits it, in the workspace it runs for.
 * Nothing is persisted, and no view receives an event after it unsubscribes.
 *
 * Split out of app-runtime-background.ts (500-LOC limit); re-exported from there.
 */

export interface AppRuntimeUiApi {
  emit(topic: string, payload: unknown): void;
}
