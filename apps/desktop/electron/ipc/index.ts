/**
 * IPC handler registry.
 *
 * Each domain exports a register function. Call registerAllIpcHandlers()
 * once from main.ts on startup. To add a new domain, create a file in
 * this directory and add its registration call below.
 */

import { registerProfileHandlers } from './workspace/profiles';
import { registerWorkspaceHandlers } from './workspace/workspace';
import { registerOnboardingHandlers } from './onboarding/onboarding';
import { registerSessionHandlers } from './agent/handlers/sessions';
import { registerAgentHandlers } from './agent/core/agent';
import { registerAppAgentHandlers } from './agent/handlers/app-agent';
import { registerGitAppHandlers } from './apps/git-app';
import { registerWebAppHandlers } from './apps/web-app';
import { registerBrowserHandlers } from './apps/browser';
import { registerVoiceHandlers } from './agent/handlers/voice';
import { registerShellHandlers } from './platform/system/shell';
import { registerAppStateHandlers } from './apps/app-state';
import { registerAppsHandlers } from './apps/apps';
import { registerAuthHandlers } from './platform/auth/auth';
import { registerContainerHandlers } from './container/container';
import { registerTerminalHandlers } from './container/terminal';
import { registerDevServerHandlers } from './container/dev-server';
import { registerEditorHandlers } from './editor/editor';
import { registerFileTreeHandlers } from './workspace/filetree';
import { registerLayoutHandlers } from './workspace/layout';
import { registerLspHandlers } from './editor/lsp';
import { registerDebugHandlers } from './editor/debug';
import { registerContextPresetsHandlers } from './workspace/context-presets';
import { registerVcsHandlers } from './integrations/vcs';
import { registerGitHubHandlers } from './integrations/github';
import { registerFeedbackHandlers } from './platform/ui/feedback';
import { registerImagegenHandlers } from './agent/handlers/imagegen';
import { registerNetHandlers } from './platform/system/net';
import { registerSafeStorageHandlers } from './platform/auth/safe-storage';
import { registerUserFeedbackQuestionHandlers } from './platform/ui/user-feedback-questions';
import { registerGatewayHandlers } from './gateway/gateway';
import { registerModelsHandlers } from './agent/handlers/models';
import { registerSubagentContextHandlers } from './agent/handlers/subagent-context';
import { registerLocalModelsHandlers } from './agent/handlers/local-models';
import { registerSubagentHandlers } from './subagent/subagent';
import { registerSkillHandlers } from './agent/handlers/skills';
import { registerPromptHandlers } from './agent/handlers/prompts';
import { registerCollaborationHandlers } from './collaboration/collaboration';
import { registerAppControlHandlers } from './apps/app-control';
import { registerPluginHandlers } from './integrations/plugins';
import { registerPluginConfigHandlers } from './apps/plugin-config';
import { registerThemeHandlers } from './platform/ui/themes';
import { registerDoctorHandlers } from './doctor/doctor';
import { registerUpdaterHandlers } from './updater';

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
  registerSubagentContextHandlers();
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
  registerUpdaterHandlers();
}
