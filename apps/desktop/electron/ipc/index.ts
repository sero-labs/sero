/**
 * IPC handler registry.
 *
 * Each domain exports a register function. Call registerAllIpcHandlers()
 * once from main.ts on startup. To add a new domain, create a file in
 * this directory and add its registration call below.
 */

import { registerProfileHandlers } from './profiles';
import { registerWorkspaceHandlers } from './workspace';
import { registerSessionHandlers } from './sessions';
import { registerAgentHandlers } from './agent';
import { registerAppAgentHandlers } from './app-agent';
import { registerVoiceHandlers } from './voice';
import { registerShellHandlers } from './shell';
import { registerAppStateHandlers } from './app-state';
import { registerAppsHandlers } from './apps';
import { registerAuthHandlers } from './auth';
import { registerContainerHandlers } from './container';
import { registerTerminalHandlers } from './terminal';
import { registerDevServerHandlers } from './dev-server';
import { registerEditorHandlers } from './editor';
import { registerFileTreeHandlers } from './filetree';
import { registerLayoutHandlers } from './layout';
import { registerLspHandlers } from './lsp';
import { registerDebugHandlers } from './debug';
import { registerContextPresetsHandlers } from './context-presets';
import { registerVcsHandlers } from './vcs';
import { registerGitHubHandlers } from './github';
import { registerFeedbackHandlers } from './feedback';
import { registerImagegenHandlers } from './imagegen';
import { registerNetHandlers } from './net';
import { registerSafeStorageHandlers } from './safe-storage';
import { registerUserFeedbackQuestionHandlers } from './user-feedback-questions';
import { registerGatewayHandlers } from './gateway';
import { registerGoogleApiHandlers } from './google-api';
import { registerModelsHandlers } from './models';
import { registerSubagentHandlers } from './subagent';
import { registerSkillHandlers } from './skills';
import { registerPromptHandlers } from './prompts';
import { registerCollaborationHandlers } from './collaboration';
import { registerAppControlHandlers } from './app-control';
import { registerThemeHandlers } from './themes';

export function registerAllIpcHandlers(): void {
  registerProfileHandlers();
  registerWorkspaceHandlers();
  registerSessionHandlers();
  registerAgentHandlers();
  registerAppAgentHandlers();
  registerVoiceHandlers();
  registerShellHandlers();
  registerAppStateHandlers();
  registerAppsHandlers();
  registerAuthHandlers();
  registerContainerHandlers();
  registerTerminalHandlers();
  registerDevServerHandlers();
  registerEditorHandlers();
  registerFileTreeHandlers();
  registerLayoutHandlers();
  registerLspHandlers();
  registerDebugHandlers();
  registerContextPresetsHandlers();
  registerVcsHandlers();
  registerGitHubHandlers();
  registerFeedbackHandlers();
  registerImagegenHandlers();
  registerNetHandlers();
  registerSafeStorageHandlers();
  registerUserFeedbackQuestionHandlers();
  registerGatewayHandlers();
  registerGoogleApiHandlers();
  registerModelsHandlers();
  registerSubagentHandlers();
  registerSkillHandlers();
  registerPromptHandlers();
  registerCollaborationHandlers();
  registerAppControlHandlers();
  registerThemeHandlers();
}
