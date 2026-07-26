import { registerGitServiceBridge } from '@electron/features/apps/git-app/service-bridge';

/**
 * The Git app's main-process wiring.
 *
 * Only the extension's side is registered here. The renderer reaches git
 * through `window.sero.vcs` — including the writes, which used to have their
 * own `sero:git-app:run` channel (AD-025, issue #305).
 */
export function registerGitAppHandlers(): void {
  registerGitServiceBridge();
}
