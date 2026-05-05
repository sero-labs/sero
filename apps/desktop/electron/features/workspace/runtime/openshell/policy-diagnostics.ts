import {
  DEFAULT_OPENSHELL_POLICY_PROFILE_ID,
  getOpenShellPolicyProfile,
  type OpenShellPolicyBlockedEventIPC,
  type OpenShellPolicyDiagnosticsIPC,
  type OpenShellPolicyOutputIPC,
  type WorkspaceRuntimeConfigIPC,
} from '@sero-ai/common';
import { formatOpenShellFailure, runOpenShell, sanitizeOutput } from './cli';

const DIAGNOSTIC_TIMEOUT_MS = 10_000;
const LOG_LINE_LIMIT = 20;
const LOG_LINE_CHAR_LIMIT = 1000;
const MATCH_TERMS = ['permission denied', 'denied', 'blocked', 'landlock', 'policy'] as const;

export interface OpenShellPolicyDiagnosticsInput {
  gatewayName: string;
  sandboxName?: string;
  runtimeConfig?: WorkspaceRuntimeConfigIPC;
}

export async function getOpenShellPolicyDiagnostics(
  input: OpenShellPolicyDiagnosticsInput,
): Promise<OpenShellPolicyDiagnosticsIPC> {
  const profileId = input.runtimeConfig?.policyProfileId ?? DEFAULT_OPENSHELL_POLICY_PROFILE_ID;
  const selectedProfile = getOpenShellPolicyProfile(profileId);

  if (!input.sandboxName) {
    const unavailable = unavailableOutput('OpenShell policy diagnostics are unavailable until a sandbox has been created.');
    return buildDiagnostics({
      selectedProfile,
      activePolicy: unavailable,
      policyList: unavailable,
      logSummary: unavailable,
      blockedEvents: [],
    });
  }

  const [activePolicyResult, policyListResult, logsResult] = await Promise.all([
    runOpenShell([
      '--gateway', input.gatewayName,
      'policy', 'get', input.sandboxName, '--full',
    ], { timeoutMs: DIAGNOSTIC_TIMEOUT_MS }),
    runOpenShell([
      '--gateway', input.gatewayName,
      'policy', 'list', input.sandboxName,
    ], { timeoutMs: DIAGNOSTIC_TIMEOUT_MS }),
    runOpenShell([
      '--gateway', input.gatewayName,
      'logs', input.sandboxName, '-n', '200', '--source', 'all', '--level', 'warn',
    ], { timeoutMs: DIAGNOSTIC_TIMEOUT_MS }),
  ]);

  const logSummary = outputFromResult('read recent OpenShell logs', logsResult);
  return buildDiagnostics({
    selectedProfile,
    activePolicy: outputFromResult('read active OpenShell policy', activePolicyResult),
    policyList: outputFromResult('list OpenShell policies', policyListResult),
    logSummary,
    blockedEvents: logsResult.exitCode === 0 ? parseOpenShellBlockedEvents(logsResult.stdout) : [],
  });
}

export function parseOpenShellBlockedEvents(output: string): OpenShellPolicyBlockedEventIPC[] {
  const events: OpenShellPolicyBlockedEventIPC[] = [];
  for (const rawLine of output.split(/\r?\n/)) {
    if (events.length >= LOG_LINE_LIMIT) break;
    const line = sanitizeDiagnosticOutput(rawLine);
    if (!line) continue;
    const lowerLine = line.toLowerCase();
    const matchedTerms = MATCH_TERMS.filter((term) => lowerLine.includes(term));
    if (matchedTerms.length === 0) continue;
    events.push({
      source: 'openshell-logs',
      line: limitLine(line),
      matchedTerms,
      bestEffort: true,
    });
  }
  return events;
}

function buildDiagnostics(input: {
  selectedProfile: OpenShellPolicyDiagnosticsIPC['selectedProfile'];
  activePolicy: OpenShellPolicyOutputIPC;
  policyList: OpenShellPolicyOutputIPC;
  logSummary: OpenShellPolicyOutputIPC;
  blockedEvents: OpenShellPolicyBlockedEventIPC[];
}): OpenShellPolicyDiagnosticsIPC {
  return {
    selectedProfile: input.selectedProfile,
    enforcementStatus: 'profile-preview-only',
    enforcementMessage: 'Sero stores this profile as policy intent but does not apply generated OpenShell policy YAML yet. Active OpenShell policy is read-only diagnostic output where available.',
    activePolicy: input.activePolicy,
    policyList: input.policyList,
    logSummary: input.logSummary,
    blockedEvents: input.blockedEvents,
    allowDenyPromptsSupported: false,
    allowDenyPromptsMessage: 'Prompt-driven allow/deny decisions are not supported by current Sero OpenShell Local integration.',
  };
}

function outputFromResult(label: string, result: { stdout: string; stderr: string; exitCode: number }): OpenShellPolicyOutputIPC {
  if (result.exitCode === 0) {
    const summary = sanitizeDiagnosticOutput(result.stdout || result.stderr);
    return { available: true, summary: summary || 'Command completed without output.' };
  }
  return unavailableOutput(sanitizeDiagnosticOutput(formatOpenShellFailure(label, result)));
}

function unavailableOutput(summary: string): OpenShellPolicyOutputIPC {
  return { available: false, summary };
}

function sanitizeDiagnosticOutput(value: string): string {
  return sanitizeOutput(value)
    .replace(/(api[_-]?key|token|secret|password|authorization)(\s*[:=]\s*)\S+/gi, '$1$2[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
}

function limitLine(value: string): string {
  return value.length <= LOG_LINE_CHAR_LIMIT ? value : `${value.slice(0, LOG_LINE_CHAR_LIMIT)}…`;
}
