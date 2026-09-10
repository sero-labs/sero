import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { registerOwnerTool } from './owner-tool';
import { registerProjectsTool } from './projects-tool';

/**
 * Two bridged tools. `architect` is the owner session's door and refuses any
 * caller that is not an owner; `architect_projects` is the user's.
 */
export default function (pi: ExtensionAPI) {
  registerOwnerTool(pi);
  registerProjectsTool(pi);
}
