export type LlmMode = 'off' | 'cheap' | 'full';

const VALID_MODES: ReadonlyArray<LlmMode> = ['off', 'cheap', 'full'];

export function getLlmMode(): LlmMode {
  const raw = process.env.SERO_E2E_LLM_MODE;
  if (raw === undefined || raw === '') return 'off';
  if ((VALID_MODES as ReadonlyArray<string>).includes(raw)) {
    return raw as LlmMode;
  }
  throw new Error(
    `Invalid SERO_E2E_LLM_MODE="${raw}". Expected one of: ${VALID_MODES.join(', ')}.`,
  );
}

export interface RequireLlmResult {
  skip: boolean;
  reason?: string;
}

export function requireLlm(): RequireLlmResult {
  const mode = getLlmMode();
  if (mode === 'off') {
    return {
      skip: true,
      reason: 'SERO_E2E_LLM_MODE=off — agent-realism tests skipped. Set to "cheap" or "full" to enable.',
    };
  }
  return { skip: false };
}
