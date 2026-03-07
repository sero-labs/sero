/**
 * Collaboration framework IPC types — shared by Electron main process and renderer.
 */

/** Role identifiers for the four collaboration agents. */
export type CollaborationRole = 'coordinator' | 'researcher' | 'analyst' | 'visionary';

/** Status of the collaboration run. */
export type CollaborationStatus = 'idle' | 'research' | 'specialists' | 'synthesis' | 'complete' | 'error';

/** A single specialist's output for display in the UI. */
export interface CollaborationSpecialistOutput {
  role: CollaborationRole;
  agentName: string;
  response: string;
  error?: string;
  durationMs: number;
}

/** Full collaboration result sent to the renderer. */
export interface CollaborationResult {
  finalResponse: string;
  specialistOutputs: CollaborationSpecialistOutput[];
  totalDurationMs: number;
  hasErrors: boolean;
}

/** Events pushed from main → renderer during collaboration. */
export type CollaborationEvent =
  | { type: 'collab_start'; sessionId: string }
  | { type: 'collab_phase'; sessionId: string; phase: 'research' | 'specialists' | 'synthesis' }
  | { type: 'collab_specialist_start'; sessionId: string; role: CollaborationRole; agentName: string }
  | { type: 'collab_specialist_end'; sessionId: string; role: CollaborationRole; agentName: string; response: string; error?: string }
  | { type: 'collab_end'; sessionId: string; result: CollaborationResult }
  | { type: 'collab_error'; sessionId: string; error: string };
