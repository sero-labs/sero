/**
 * The Orchestrator surface, re-exported as one group.
 *
 * Split from the package barrel to keep each file within the 500-LOC limit.
 */

export {
  ORCHESTRATOR_APP_ID,
  ORCHESTRATOR_INDEX_FILE,
  ORCHESTRATOR_ROOM_INDEX_FILE,
  resolveOrchestratorTriggerIntent,
} from './orchestrator-contract';
export {
  ORCHESTRATOR_REGISTRY_GLOBAL_KEY,
  ORCHESTRATOR_ROOM_REGISTRY_GLOBAL_KEY,
  getOrchestratorRegistry,
  getOrchestratorRoomRegistry,
  requestOrchestratorAction,
  createOrchestratorRoom,
} from './orchestrator-registry';
export {
  checkOrchestratorProjectContext,
  sameOrchestratorProjectAttribution,
} from './orchestrator-project-context';
export type {
  OrchestratorLoopStatus,
  OrchestratorScheduleSummary,
  OrchestratorScheduledLoopView,
  OrchestratorIndexView,
  OrchestratorSetScheduleParams,
  OrchestratorQuestionChoiceView,
  OrchestratorQuestionView,
  OrchestratorAttentionInputView,
  OrchestratorAttentionSuggestionView,
  OrchestratorAttentionView,
  OrchestratorProgressView,
  OrchestratorUsageView,
  OrchestratorPullRequestView,
  OrchestratorBoardLoopView,
  OrchestratorBoardIndexView,
  OrchestratorRoomStatus,
  OrchestratorBoardRoomView,
  OrchestratorBoardRoomIndexView,
  OrchestratorInputAnswerView,
  OrchestratorBoardEventView,
  OrchestratorBoardAction,
  OrchestratorBoardActionResult,
  OrchestratorBoardCreateOptions,
  OrchestratorBoardDeliverySettings,
  OrchestratorBoardTriggerSuggestion,
  OrchestratorDeliveryDestinationId,
  OrchestratorBoardLoopLimits,
} from './orchestrator-contract';
export type {
  OrchestratorCoordinatorHandle,
  OrchestratorRegistryEntryView,
  OrchestratorRoomCreateLimits,
  OrchestratorRoomCreateRequest,
  OrchestratorRoomCreateResult,
  OrchestratorRoomHandle,
  OrchestratorRoomRegistryEntryView,
} from './orchestrator-registry';
export type {
  OrchestratorProjectContext,
  OrchestratorProjectContextCheck,
  OrchestratorProjectModelSnapshot,
  OrchestratorProjectTierSnapshot,
  OrchestratorTriggerIntent,
} from './orchestrator-project-context';
