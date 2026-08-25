import type { ControlOperationName, ControlStreamName } from './constants';

export type ControlBoundaryEntry = Readonly<{
  boundary: 'control-plane';
  gap: string;
}>;

const ENROLMENT_GAP = 'A2A defines no enrolment or controller administration.';
const SESSION_GAP = 'A2A has no ListContexts; a context is not a resource.';
const AUTH_GAP = "A2A does not cover the agent's upstream provider credentials.";

export const CONTROL_OPERATION_BOUNDARIES = {
  enrol: { boundary: 'control-plane', gap: ENROLMENT_GAP },
  mintEnrolmentCode: { boundary: 'control-plane', gap: ENROLMENT_GAP },
  listControllers: { boundary: 'control-plane', gap: ENROLMENT_GAP },
  revokeController: { boundary: 'control-plane', gap: ENROLMENT_GAP },
  listSessions: { boundary: 'control-plane', gap: SESSION_GAP },
  createSession: { boundary: 'control-plane', gap: SESSION_GAP },
  deleteSession: { boundary: 'control-plane', gap: SESSION_GAP },
  setSessionModel: { boundary: 'control-plane', gap: 'A2A carries no model selection.' },
  getNodeHealth: {
    boundary: 'control-plane',
    gap: 'The Agent Card is static; health is not present on it.',
  },
  getProviders: { boundary: 'control-plane', gap: AUTH_GAP },
  login: { boundary: 'control-plane', gap: AUTH_GAP },
  logout: { boundary: 'control-plane', gap: AUTH_GAP },
  setApiKey: { boundary: 'control-plane', gap: AUTH_GAP },
  removeApiKey: { boundary: 'control-plane', gap: AUTH_GAP },
  respondPrompt: { boundary: 'control-plane', gap: AUTH_GAP },
  respondSelect: { boundary: 'control-plane', gap: AUTH_GAP },
  respondManualCode: { boundary: 'control-plane', gap: AUTH_GAP },
  cancel: { boundary: 'control-plane', gap: AUTH_GAP },
} as const satisfies Record<ControlOperationName, ControlBoundaryEntry>;

export const CONTROL_STREAM_BOUNDARIES = {
  nodeEvents: {
    boundary: 'control-plane',
    gap: 'The Agent Card is static; health and presence are not present on it.',
  },
  sessionEvents: {
    boundary: 'control-plane',
    gap: 'SubscribeToTask has no cursor and is per task, not per session.',
  },
  authEvents: {
    boundary: 'control-plane',
    gap: "A2A does not cover the agent's upstream provider credentials.",
  },
} as const satisfies Record<ControlStreamName, ControlBoundaryEntry>;
