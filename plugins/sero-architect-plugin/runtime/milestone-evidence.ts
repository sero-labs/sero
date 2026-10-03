import type { Milestone } from '../shared/record';

/** Why a milestone cannot close yet, in the owner's words. Empty means it can. */
export function missingEvidence(milestone: Milestone): string[] {
  const evidence = milestone.evidence;
  if (!evidence) return ['no evidence run has happened'];
  const missing: string[] = [];
  if (evidence.stale) missing.push('the evidence is stale: files changed after it was taken, so it must be rerun');
  if (!evidence.passed) missing.push('the evidence run did not pass');
  if (evidence.filesChanged && evidence.diffSummary === null) missing.push('project files changed but no diff summary was recorded');
  if (evidence.commands.length === 0) missing.push('no command was run');
  for (const command of evidence.commands) {
    if (command.exitCode !== 0) missing.push(`command "${command.command}" failed with exit code ${command.exitCode}`);
  }
  if (milestone.preview) {
    if (!evidence.preview) missing.push(`the preview route ${milestone.preview.route} has no smoke check`);
    else {
      if (!evidence.preview.smokePassed) missing.push('the dev-server smoke check failed');
      if (!evidence.preview.capturePath) missing.push('no capture was recorded for the preview');
    }
  }
  return missing;
}
