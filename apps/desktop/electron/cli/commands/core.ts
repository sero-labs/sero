import { registerHelpCliCommand } from '../core/help';
import type { CliRegistry } from '../core/registry';
import {
  registerAppControlCliCommands,
  registerAppStateCliCommands,
  registerArtifactCliCommands,
} from './apps';
import { registerDevServerCliCommands, registerTerminalCliCommands } from './container';
import { registerEditorCliCommands } from './editor';
import { registerBrowserCliCommands } from './browser';
import { registerSessionCliCommands } from './agent';
import { registerVcsCliCommands } from './git';
import { registerWorkspaceCliCommands } from './workspace';

/** Every built-in `sero` command. The tool check reads its inventory from this list. */
export function registerCoreCommands(target: CliRegistry): void {
  registerAppControlCliCommands(target);
  registerWorkspaceCliCommands(target);
  registerSessionCliCommands(target);
  registerVcsCliCommands(target);
  registerDevServerCliCommands(target);
  registerArtifactCliCommands(target);
  registerEditorCliCommands(target);
  registerAppStateCliCommands(target);
  registerTerminalCliCommands(target);
  registerBrowserCliCommands(target);
  registerHelpCliCommand(target);
}
