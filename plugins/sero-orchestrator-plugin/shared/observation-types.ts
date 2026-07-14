/** One piece of run context captured from a model, event, user, or the system. */
export interface Observation {
  id: string;
  source:
    | 'model'
    | 'background-agent'
    | 'active-session'
    | 'manual'
    | 'event'
    | 'system';
  summary: string;
  data?: Record<string, unknown>;
  artifactPath?: string;
  createdAt: string;
}
