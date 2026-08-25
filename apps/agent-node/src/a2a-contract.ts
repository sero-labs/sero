// Temporary build bridge until the in-flight @sero/a2a workspace package lands.
export const A2A_VERSION = "1.0" as const;
export const SERO_CONTROL_VERSION = "1" as const;
export const SERO_AGENT_EXTENSION_URI = "https://sero-ai.dev/a2a/extensions/agent-node/v1" as const;
export const CONTROL_OPERATIONS = [
  "enrol", "mintEnrolmentCode", "listControllers", "revokeController",
  "listSessions", "createSession", "deleteSession", "setSessionModel", "getNodeHealth",
  "getProviders", "login", "logout", "setApiKey", "removeApiKey", "respondPrompt",
  "respondSelect", "respondManualCode", "cancel",
] as const;
export type ControlOperation = (typeof CONTROL_OPERATIONS)[number];
