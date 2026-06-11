/**
 * Token Baseline Benchmark
 *
 * Measures each component of the system prompt and tool schemas to track
 * the per-session token cost. Run with `pnpm test` from apps/desktop/.
 *
 * This test does NOT make API calls or launch Electron — it imports the
 * same functions Sero uses and measures their output directly.
 *
 * Rough token estimation: 1 token ≈ 4 characters (conservative for English).
 * The exact count varies by model tokenizer, but this ratio is consistent
 * enough for regression tracking.
 */

import { describe, it, expect, vi } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: '/tmp/sero-agent',
  SERO_FIXED_ROOT: '/tmp/sero-fixed',
  SERO_HOST_ARTIFACTS_ROOT: '/tmp/sero-host-artifacts',
  SERO_HOME: '/tmp/sero-home',
}));

import { buildContainerPromptBlock, buildHostPromptBlock } from '@electron/features/container/tools/system-prompt';
import { buildCliPromptBlock } from '@electron/cli';
import {
  BashParams,
  ReadParams,
  WriteParams,
  EditParams,
  BrowserParams,
} from '@electron/features/container/tools/tool-schemas';

// ── Token estimation ────────────────────────────────────────

/**
 * Estimate tokens from character count.
 *
 * Claude's tokenizer averages ~2.8 chars/token for technical content
 * (markdown, JSON schemas, code). Calibrated against a real session:
 * 10,335 actual tokens vs ~28,900 total chars = 2.8 chars/token.
 *
 * The old ratio (4.0) underestimated by ~45%. This ratio matches
 * real-world measurements within ~10%.
 */
const CHARS_PER_TOKEN = 2.8;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate tokens for a tool schema as sent in the API `tools` parameter.
 * The API sees: name + description + JSON-serialized parameter schema
 * plus ~80 tokens of per-tool overhead (role markers, formatting).
 */
function estimateToolSchemaTokens(tool: {
  name: string;
  description: string;
  parameters: unknown;
}): number {
  const schemaJson = JSON.stringify(tool.parameters);
  const combined = `${tool.name}\n${tool.description}\n${schemaJson}`;
  return estimateTokens(combined) + 80;
}

// ── Fixtures ────────────────────────────────────────────────

/** Replicate the SDK's base prompt template (static portions only). */
function buildSdkBasePrompt(): string {
  return `You are an expert coding assistant operating inside pi, a coding agent harness. You help users by reading files, executing commands, editing code, and writing new files.

Available tools:
- read: Read file contents
- bash: Execute bash commands (ls, grep, find, etc.)
- edit: Make surgical edits to files (find exact text and replace)
- write: Create or overwrite files

In addition to the tools above, you may have access to other custom tools depending on the project.

Guidelines:
- Use bash for file operations like ls, rg, find
- Use read to examine files before editing. You must use this tool instead of cat or sed.
- Use edit for precise changes (old text must match exactly)
- Use write only for new files or complete rewrites
- When summarizing your actions, output plain text directly - do NOT use cat or bash to display what you did
- Be concise in your responses
- Show file paths clearly when working with files

Pi documentation (read only when the user asks about pi itself, its SDK, extensions, themes, skills, or TUI):
- Main documentation: /path/to/README.md
- Additional docs: /path/to/docs
- Examples: /path/to/examples (extensions, custom tools, SDK)
- When asked about: extensions, themes, skills, prompt templates, TUI, keybindings, SDK, custom providers, models, packages
- When working on pi topics, read the docs and examples
- Always read pi .md files completely and follow links to related docs`;
}

/**
 * Build a realistic skills listing for a functional default Sero install.
 *
 * This reflects the full progressive-disclosure surface being available by
 * default. Users can still hide specific skills globally from the Admin app
 * when they want to trim prompt size.
 */
function buildSkillsListing(): string {
  const skills = [
    { name: 'ai-elements', desc: 'Create new AI chat interface components.' },
    { name: 'browser-tools', desc: 'Interactive browser automation for testing and visible web workflows.' },
    { name: 'context7', desc: 'Retrieve up-to-date documentation for software libraries.' },
    { name: 'crawl', desc: 'Crawl websites and save pages as local markdown files.' },
    { name: 'extract', desc: 'Extract clean markdown or text from specific URLs.' },
    { name: 'frontend-design', desc: 'Create distinctive, production-grade frontend interfaces.' },
    { name: 'humanizer', desc: 'Remove signs of AI-generated writing from text.' },
    { name: 'plan-exit-review', desc: 'Review a plan thoroughly before implementation.' },
    { name: 'plan-interview', desc: 'Adaptive interview for generating comprehensive specifications.' },
    { name: 'playwright-cli', desc: 'Automates browser interactions for testing, screenshots, and extraction.' },
    { name: 'research', desc: 'Get AI-synthesised research on a topic with citations.' },
    { name: 'search', desc: 'Search the web using an LLM-optimised search API.' },
    { name: 'skill-creator', desc: 'Guide for creating effective skills.' },
    { name: 'transcribe', desc: 'Speech-to-text transcription for common audio formats.' },
    { name: 'vscode', desc: 'VS Code integration for viewing diffs and comparing files.' },
    { name: 'webapp-testing', desc: 'Toolkit for interacting with and testing local web applications.' },
  ];

  let text = '\nThe following skills provide specialized instructions for specific tasks.\n';
  text += 'Use the read tool to load a skill\'s file when the task matches its description.\n\n';
  text += '<available_skills>\n';
  for (const s of skills) {
    text += `  <skill>\n`;
    text += `    <name>${s.name}</name>\n`;
    text += `    <description>${s.desc}</description>\n`;
    text += `    <location>/path/to/skills/${s.name}/SKILL.md</location>\n`;
    text += `  </skill>\n`;
  }
  text += '</available_skills>\n';
  return text;
}

// ── Core tools (these stay as standalone tool schemas) ───────
//
// Coding tools + sero-cli + tools that depend on SDK internals
// (ctx.sessionManager). Everything else is bridged into sero-cli.

const CORE_TOOLS = [
  { name: 'bash', description: 'Execute a bash command in the current working directory. Returns stdout and stderr. Output is truncated to last 2000 lines or 50KB. Do not hard-code PATH prefixes; inspect package.json and prefer project scripts over ad-hoc npx commands.', parameters: BashParams },
  { name: 'read', description: 'Read the contents of a file. Supports text files and images. Output is truncated to 2000 lines or 50KB. Use offset/limit for large files.', parameters: ReadParams },
  { name: 'write', description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Automatically creates parent directories.", parameters: WriteParams },
  { name: 'edit', description: 'Edit a file by replacing exact text. The oldText must match exactly (including whitespace). Use this for precise, surgical edits.', parameters: EditParams },
  { name: 'automation_browser', description: 'Control a hidden Chromium automation browser inside the runtime for testing web UIs. Do not use for visible Browser panel or user screen recordings. Actions: launch, navigate, click, type, press_key, screenshot, scroll, evaluate, get_text, wait, close.', parameters: BrowserParams },
  { name: 'sero-cli', description: 'Execute Sero platform commands. Run `sero help` for commands. Supports multi-line input to chain commands.', parameters: { type: 'object', properties: { command: { type: 'string' }, timeout: { type: 'number' } }, required: ['command'] } },
];

// ── The test ────────────────────────────────────────────────

describe('Token Baseline Benchmark', () => {
  const components: Record<string, { chars: number; tokens: number }> = {};

  function measure(name: string, text: string) {
    const tokens = estimateTokens(text);
    components[name] = { chars: text.length, tokens };
    return tokens;
  }

  it('SDK base prompt', () => {
    const prompt = buildSdkBasePrompt();
    const tokens = measure('sdk_base_prompt', prompt);
    expect(tokens).toBeLessThan(700);
  });

  it('AGENTS.md (global workspace)', () => {
    // Check the real global workspace AGENTS.md if available
    const globalAgentsPath = path.join(
      process.env.HOME ?? '~',
      '.sero-ui/workspaces/global/AGENTS.md',
    );

    if (existsSync(globalAgentsPath)) {
      const content = readFileSync(globalAgentsPath, 'utf8');
      const tokens = measure('agents_md', content);
      // Budget: a workspace AGENTS.md should stay under 5,000 tokens
      expect(tokens).toBeLessThan(5_000);
    } else {
      // No global AGENTS.md — score 0
      measure('agents_md', '');
    }
  });

  it('Container system prompt block', () => {
    const block = buildContainerPromptBlock('test-workspace', '192.168.64.2');
    const tokens = measure('container_block', block);
    expect(tokens).toBeLessThan(2_650);
    expect(block).toContain('Pi/Sero self-building documentation');
    expect(block).toContain('/tmp/sero-host-artifacts/shared/pi-docs/docs');
  });

  it('Host system prompt block', () => {
    const block = buildHostPromptBlock('test-workspace', '/Users/me/workspace', { platform: 'darwin' });
    const tokens = measure('host_block', block);
    expect(tokens).toBeLessThan(850);
    expect(block).toContain('Do NOT hard-code PATH prefixes');
    expect(block).toContain('@types/react');
    expect(block).toContain('self-building documentation fallback');
  });

  it('CLI prompt block', () => {
    const block = buildCliPromptBlock();
    const tokens = measure('cli_block', block);
    // Includes per-command summaries (saves sero help round-trips)
    expect(tokens).toBeLessThan(1_000);
  });

  it('Skills listing', () => {
    const listing = buildSkillsListing();
    const tokens = measure('skills_listing', listing);
    expect(tokens).toBeLessThan(2_500);
  });

  it('Tool schemas (API-level)', () => {
    let totalTokens = 0;
    const perTool: Record<string, number> = {};
    for (const tool of CORE_TOOLS) {
      const tokens = estimateToolSchemaTokens(tool);
      perTool[tool.name] = tokens;
      totalTokens += tokens;
    }
    components['tool_schemas'] = { chars: 0, tokens: totalTokens };
    components['tool_schemas_breakdown'] = { chars: 0, tokens: 0, ...perTool } as any;

    // 6 tools should cost less than 4,000 tokens
    expect(totalTokens).toBeLessThan(4_000);
    expect(CORE_TOOLS).toHaveLength(6);
  });

  it('TOTAL stays within budget', () => {
    const total = Object.entries(components)
      .filter(([key]) => !key.endsWith('_breakdown'))
      .reduce((sum, [, val]) => sum + val.tokens, 0);

    // ── Report ────────────────────────────────────────────
    console.log('\n┌─────────────────────────────────────────────────┐');
    console.log('│         TOKEN BASELINE BENCHMARK                │');
    console.log('├──────────────────────────┬───────┬──────────────┤');
    console.log('│ Component                │ Tokens│ % of total   │');
    console.log('├──────────────────────────┼───────┼──────────────┤');

    for (const [name, val] of Object.entries(components)) {
      if (name.endsWith('_breakdown')) continue;
      const pct = total > 0 ? ((val.tokens / total) * 100).toFixed(1) : '0.0';
      const label = name.padEnd(24);
      const tok = String(val.tokens).padStart(5);
      console.log(`│ ${label} │ ${tok} │ ${pct.padStart(10)}%  │`);
    }

    console.log('├──────────────────────────┼───────┼──────────────┤');
    console.log(`│ ${'TOTAL'.padEnd(24)} │ ${String(total).padStart(5)} │              │`);
    console.log('└──────────────────────────┴───────┴──────────────┘');

    // Tool schema breakdown
    const breakdown = components['tool_schemas_breakdown'] as any;
    if (breakdown) {
      console.log('\n  Tool schema breakdown:');
      for (const [name, tokens] of Object.entries(breakdown)) {
        if (name === 'chars' || name === 'tokens') continue;
        console.log(`    ${name.padEnd(20)} ${String(tokens).padStart(5)} tokens`);
      }
    }

    // ── Budget assertion ──────────────────────────────────
    // Before optimisations: ~13,300 actual tokens
    // After optimisations:  ~10,300 actual tokens
    // Estimated baseline:   ~10,200 (calibrated at 2.8 chars/token)
    // Budget headroom:       12,000 tokens (catches regressions >15%)
    //
    // Last verified actual (cacheWrite): 10,335 tokens
    // (session 2026-02-28, workspace test-2, opus with high thinking)
    expect(total).toBeLessThan(12_000);
    console.log(`\n  Budget: ${total} / 12,000 tokens (${((total / 12_000) * 100).toFixed(0)}% used)`);
    console.log(`  Last verified actual: 10,335 tokens`);
  });
});
