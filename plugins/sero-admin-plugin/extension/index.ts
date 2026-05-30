/**
 * Sero Admin extension.
 *
 * The Admin surface is intentionally UI-only. It exposes sensitive files
 * (auth, .env, settings, logs), so it must not be available as an agent tool
 * or bridged into `sero-cli`.
 */

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export default function adminExtension(pi: ExtensionAPI) {
  pi.registerCommand('admin', {
    description: 'Open the Admin app to inspect Sero configs, sessions, and logs',
    handler: async (_args, ctx) => {
      ctx.ui?.notify(
        'Open the Admin app in Sero to inspect configs, sessions, and logs. This surface is UI-only for safety.',
        'info',
      );
    },
  });
}
