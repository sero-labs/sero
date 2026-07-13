/**
 * Maps a typed OrchestratorAction to the flat orchestrator tool params
 * (extension/tools.ts `buildAction` is the inverse). Pure and unit-tested —
 * a UI dispatch whose payload never reaches the tool is a silent-breakage
 * class this file exists to prevent.
 */

import type { OrchestratorAction } from '../../shared/types';

export function actionToParams(action: OrchestratorAction): Record<string, unknown> {
  const params: Record<string, unknown> = { action: action.kind };
  if ('loopId' in action) params.loopId = action.loopId;
  switch (action.kind) {
    case 'choose_suggestion':
      params.suggestionId = action.suggestionId;
      params.decision = action.decision;
      if (action.rejectionReason !== undefined) params.rejectionReason = action.rejectionReason;
      break;
    case 'answer_input':
      params.requestId = action.requestId;
      params.answersJson = JSON.stringify(action.answers);
      break;
    case 'revise':
      if (action.prompt) params.prompt = action.prompt;
      break;
    case 'retry_step':
      params.stepId = action.stepId;
      break;
    case 'delete':
      params.deleteBranch = action.deleteBranch;
      break;
    case 'set_step_model':
      params.stepId = action.stepId;
      if (action.model !== undefined) params.model = action.model;
      if (action.thinking !== undefined) params.thinking = action.thinking;
      break;
    case 'set_step_tools':
      params.stepId = action.stepId;
      params.toolsJson = JSON.stringify(action.tools ?? null);
      break;
    case 'set_step_agent':
      params.stepId = action.stepId;
      if (action.agent !== undefined) params.agent = action.agent;
      break;
    case 'set_loop_context':
      params.contextJson = JSON.stringify(action.overrides);
      break;
    case 'set_delivery':
      params.deliveryDestination = action.delivery.destination;
      if (action.delivery.params) params.deliveryParamsJson = JSON.stringify(action.delivery.params);
      break;
    case 'set_schedule':
      params.triggerId = action.triggerId;
      if (action.schedule !== undefined) params.schedule = action.schedule;
      if (action.disabled !== undefined) params.scheduleDisabled = action.disabled;
      break;
    case 'library_save':
      params.mode = action.mode;
      if (action.name !== undefined) params.name = action.name;
      if (action.note !== undefined) params.note = action.note;
      break;
    case 'library_set_version':
      params.version = action.version;
      break;
    case 'library_load':
      params.entryId = action.entryId;
      if (action.version !== undefined) params.version = action.version;
      break;
    case 'library_delete':
      params.entryId = action.entryId;
      break;
    case 'catalog_add_repo':
      params.url = action.url;
      break;
    case 'catalog_remove_repo':
      params.repoKey = action.repoKey;
      break;
    case 'catalog_refresh':
      if (action.repoKey !== undefined) params.repoKey = action.repoKey;
      break;
    case 'catalog_install':
      params.repoKey = action.repoKey;
      params.slug = action.slug;
      if (action.workspaceLoad !== undefined) params.workspaceLoad = action.workspaceLoad;
      break;
    default:
      break;
  }
  return params;
}
