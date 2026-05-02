export function notifyPreviousSessionSwitch(
  previousSessionId: string | null,
  nextSessionId: string | null,
): void {
  if (!previousSessionId || previousSessionId === nextSessionId) return;

  window.sero.agent.notifySessionSwitch(previousSessionId, 'resume').catch((err) => {
    console.warn('[agent-store] notifySessionSwitch failed for', previousSessionId, err);
  });
}
