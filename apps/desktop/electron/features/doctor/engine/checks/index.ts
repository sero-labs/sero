/**
 * Self-registers all built-in doctor checks via side-effecting calls.
 *
 * The runner imports this module once; nothing else should import it.
 * Each `register*Checks` function appends its checks to the engine
 * registry. Re-importing this module is a no-op (the registry guards
 * against duplicate IDs and the registration calls are idempotent only
 * when the registry is empty — production paths only execute once).
 */

import { registerEnvironmentChecks } from './environment';
import { registerNodeChecks } from './node';
import { registerPluginChecks } from './plugins';
import { registerProfileChecks } from './profile';
import { registerProfileRegistryChecks } from './profile-registry';
import { registerProviderChecks } from './providers';
import { registerRuntimeContainerChecks } from './runtime-container';
import { registerSystemChecks } from './system';
import { registerWorkspaceChecks } from './workspace';

let registered = false;

export function ensureBuiltinChecksRegistered(): void {
  if (registered) return;
  registerSystemChecks();
  registerRuntimeContainerChecks();
  registerNodeChecks();
  registerProfileRegistryChecks();
  registerProfileChecks();
  registerWorkspaceChecks();
  registerProviderChecks();
  registerPluginChecks();
  registerEnvironmentChecks();
  registered = true;
}

ensureBuiltinChecksRegistered();
