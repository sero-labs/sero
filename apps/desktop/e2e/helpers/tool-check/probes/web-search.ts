import type { ToolProbe } from '../types';

/**
 * Every search path ends at a service the plugin addresses by a fixed URL.
 * None reads a base URL from config or the environment, and none has a local
 * mode, so the page server cannot stand in.
 *
 * Exa's keyless MCP path costs the caller nothing, but it is still Exa's
 * hosted service, called at a URL fixed in `exa-mcp.ts`.
 */
const SEARCH_PROVIDERS =
  'Exa API with a key (api.exa.ai, exa.ts) or without one the hosted Exa MCP service (mcp.exa.ai, exa-mcp.ts); '
  + 'Perplexity API (api.perplexity.ai, perplexity.ts); Gemini API (generativelanguage.googleapis.com, gemini-api.ts and gemini-search.ts); '
  + 'Gemini Web (gemini.google.com, gemini-web.ts, which also needs a signed-in browser profile). '
  + 'Their URLs are constants, chosen by search() in gemini-search.ts.';

export const webSearchProbe: ToolProbe = {
  tool: 'web_search',
  steps: [],
  exemptions: [{ action: null, reason: 'paid outside service', detail: `Every provider is a paid or quota-limited outside API. ${SEARCH_PROVIDERS}` }],
};

export const codeSearchProbe: ToolProbe = {
  tool: 'code_search',
  steps: [],
  exemptions: [{
    action: null,
    reason: 'paid outside service',
    detail: 'code_search has one path: callExaMcp() in exa-mcp.ts posts to the hosted Exa MCP service (EXA_MCP_URL = https://mcp.exa.ai/mcp), '
      + 'a constant with no config or environment override and no local mode (code-search.ts, tools-code-search.ts).',
  }],
};
