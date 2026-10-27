import type { UserFeedbackOrigin } from '@sero-ai/common';

/** Display target from the host's app identity and the grant's bound owner. */
export function grantQuestionOrigin(appId: string, workspaceId: string, owner: string): UserFeedbackOrigin {
  const projectId = appId === 'architect' && owner.startsWith('architect:') ? owner.slice('architect:'.length) : null;
  const roomId = appId === 'orchestrator' && owner.startsWith('room:') ? owner.slice('room:'.length) : null;
  return {
    context: { workspaceId, source: projectId ? 'Architect' : roomId ? 'Room' : 'Agent access' },
    ...(projectId ? { openTarget: { appId, params: { projectId }, label: 'Open project' } }
      : roomId ? { openTarget: { appId, workspaceId, params: { roomId }, label: 'Open Room' } } : {}),
  };
}
