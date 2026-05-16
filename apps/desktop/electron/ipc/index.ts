/**
 * IPC handler registry.
 *
 * Each domain exports a register function. Call registerAllIpcHandlers()
 * once from main.ts on startup. To add a new domain, create a file in
 * this directory and add its registration call below.
 */

import { registerProfileHandlers } from './workspace/profiles';
import { registerWorkspaceHandlers } from './workspace';
import { registerOnboardingHandlers } from './onboarding/onboarding';
import { registerSessionHandlers } from './agent/handlers/sessions';
import { registerAgentHandlers } from './agent';
import { registerAppAgentHandlers } from './agent/handlers/app-agent';
import { registerGitAppHandlers } from './apps/git-app';
import { registerWebAppHandlers } from './apps/web-app';
import { registerBrowserHandlers } from './apps/browser';
import { registerVoiceHandlers } from './agent/handlers/voice';
import { registerShellHandlers } from './platform/system';
import { registerAppStateHandlers } from './apps/app-state';
import { registerAppsHandlers } from './apps';
import { registerAuthHandlers } from './platform/auth';
import { registerContainerHandlers } from './container';
import { registerTerminalHandlers } from './container/terminal';
import { registerDevServerHandlers } from './container/dev-server';
import { registerEditorHandlers } from './editor';
import { registerFileTreeHandlers } from './workspace/filetree';
import { registerLayoutHandlers } from './workspace/layout';
import { registerLspHandlers } from './editor/lsp';
import { registerDebugHandlers } from './editor/debug';
import { registerContextPresetsHandlers } from './workspace/context-presets';
import { registerVcsHandlers } from './integrations/vcs';
import { registerGitHubHandlers } from './integrations/github';
import { registerFeedbackHandlers } from './platform/ui';
import { registerImagegenHandlers } from './agent/handlers/imagegen';
import { registerNetHandlers } from './platform/system';
import { registerSafeStorageHandlers } from './platform/auth';
import { registerUserFeedbackQuestionHandlers } from './platform/ui';
import { registerGatewayHandlers } from './gateway';
import { registerModelsHandlers } from './agent/handlers/models';
import { registerLocalModelsHandlers } from './agent/handlers/local-models';
import { registerSubagentHandlers } from './subagent';
import { registerSkillHandlers } from './agent/handlers/skills';
import { registerPromptHandlers } from './agent/handlers/prompts';
import { registerCollaborationHandlers } from './collaboration';
import { registerAppControlHandlers } from './apps/app-control';
import { registerPluginHandlers } from './integrations/plugins';
import { registerPluginConfigHandlers } from './apps/plugin-config';
import { registerThemeHandlers } from './platform/ui';
import { registerDoctorHandlers } from './doctor/doctor';
import { registerMemoryScratchpadHandlers } from './memory/scratchpad';

export function registerAllIpcHandlers(): void {
  registerProfileHandlers();
  registerWorkspaceHandlers();
  registerOnboardingHandlers();
  registerSessionHandlers();
  registerAgentHandlers();
  registerAppAgentHandlers();
  registerGitAppHandlers();
  registerWebAppHandlers();
  registerBrowserHandlers();
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
  registerModelsHandlers();
  registerLocalModelsHandlers();
  registerSubagentHandlers();
  registerSkillHandlers();
  registerPromptHandlers();
  registerCollaborationHandlers();
  registerAppControlHandlers();
  registerPluginHandlers();
  registerPluginConfigHandlers();
  registerThemeHandlers();
  registerDoctorHandlers();
  registerMemoryScratchpadHandlers();
}
