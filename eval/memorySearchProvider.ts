/**
 * Offline memory search eval: fixed entries and queries, no LLM calls.
 *
 * Scores every query with the memory plugin's own search, in keyword mode
 * (terms only) or hybrid mode (terms plus the local embedding model), and
 * reports the hit rate and false-hit rate for a range of recall thresholds.
 *
 * - Hit rate: expected memories returned at the threshold, out of all expected.
 * - False-hit rate: queries that got at least one memory they should not, out
 *   of all queries.
 *
 * Hybrid mode needs the QMD embedding model, which is downloaded once per
 * machine into ~/.cache/qmd.
 */
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ApiProvider, ProviderResponse } from 'promptfoo';

import { globalLocation, workspaceLocation, writeEntry } from '../plugins/sero-memory-plugin/extension/entry-store';
import { memorySearchThresholds, rateAtThreshold, type ScoredQuery } from './memory-search/rates';

interface FixtureEntry {
  id: string;
  scope: 'global' | 'workspace';
  type: 'preference' | 'decision' | 'lesson' | 'reference';
  content: string;
  behaviour: string;
  terms: string[];
}

interface Fixture {
  entries: FixtureEntry[];
  queries: Array<{ query: string; expected: string[] }>;
}

interface MemorySearchConfig {
  mode: 'keyword' | 'hybrid';
}

async function scoreQueries(mode: MemorySearchConfig['mode']): Promise<{ scored: ScoredQuery[]; searchMode: string }> {
  const fixture = JSON.parse(await readFile(path.join(__dirname, 'memory-search', 'fixture.json'), 'utf8')) as Fixture;
  const seroHome = await mkdtemp(path.join(os.tmpdir(), 'sero-memory-search-eval-'));
  const previous = { SERO_HOME: process.env.SERO_HOME, PI_CODING_AGENT_DIR: process.env.PI_CODING_AGENT_DIR };
  process.env.SERO_HOME = seroHome;
  process.env.PI_CODING_AGENT_DIR = path.join(seroHome, 'agent');
  try {
    const workspace = path.join(seroHome, 'project');
    const locations = [globalLocation(), workspaceLocation(workspace)];
    for (const entry of fixture.entries) {
      await writeEntry(entry.scope === 'global' ? locations[0]! : locations[1]!, {
        id: entry.id,
        type: entry.type,
        scope: entry.scope,
        created: '2026-09-01',
        confirmed: '2026-09-01',
        replaces: [],
        terms: entry.terms,
        body: `${entry.content}\n\nBehaviour: ${entry.behaviour}`,
      }, 'on-match');
    }

    // Loaded after SERO_HOME is set: the index path is read from it.
    const { searchEntries } = await import('../plugins/sero-memory-plugin/extension/memory-search');
    const qmd = await import('../plugins/sero-memory-plugin/extension/qmd-index');
    const { memoryRegistry } = await import('../plugins/sero-memory-plugin/extension/registry');
    if (mode === 'hybrid') {
      if (!(await qmd.acquireIndex('eval', workspace))) throw new Error('QMD index did not open');
      while (memoryRegistry().qmd.embedding) await memoryRegistry().qmd.embedding;
      if (!memoryRegistry().qmd.embeddingsReady) throw new Error('Embedding model did not load; see <SERO_HOME>/debug/memory');
    }

    const scored: ScoredQuery[] = [];
    let searchMode = 'keyword';
    for (const { query, expected } of fixture.queries) {
      const { results, mode: used } = await searchEntries(query, locations, 'recall');
      searchMode = used;
      scored.push({ query, expected, scores: results.map((result) => ({ id: result.entry.id, score: result.score })) });
    }
    if (mode === 'hybrid') await qmd.releaseIndex('eval');
    return { scored, searchMode };
  } finally {
    process.env.SERO_HOME = previous.SERO_HOME;
    process.env.PI_CODING_AGENT_DIR = previous.PI_CODING_AGENT_DIR;
    await rm(seroHome, { recursive: true, force: true });
  }
}

export default class MemorySearchProvider implements ApiProvider {
  private config: MemorySearchConfig;

  constructor(opts: { config?: MemorySearchConfig } = {}) {
    this.config = opts.config ?? { mode: 'keyword' };
  }

  id(): string {
    return `sero:memory-search:${this.config.mode}`;
  }

  async callApi(): Promise<ProviderResponse> {
    const { scored, searchMode } = await scoreQueries(this.config.mode);
    const rows = memorySearchThresholds().map((threshold) => rateAtThreshold(scored, threshold));
    const table = [
      `Mode: ${searchMode} (${scored.length} queries)`,
      'threshold  hit-rate  false-hit-rate',
      ...rows.map((row) => `${row.threshold.toFixed(2).padStart(9)}  ${row.hitRate.toFixed(2).padStart(8)}  ${row.falseHitRate.toFixed(2).padStart(14)}`),
      '',
      'Misses and false hits at each query (score):',
      ...scored.map((item) => `${item.query} -> ${item.scores.slice(0, 3).map((s) => `${s.id} ${s.score.toFixed(2)}`).join(', ')} (expected: ${item.expected.join(', ') || 'none'})`),
    ].join('\n');
    return { output: table, metadata: { searchMode, rows } };
  }
}
