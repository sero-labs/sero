#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const resultPath = process.argv[2];
if (!resultPath) {
  console.error('Usage: node eval/report-search-eval.mjs <promptfoo-export.json>');
  process.exit(2);
}

const exported = JSON.parse(await readFile(resultPath, 'utf8'));
const results = exported.results?.results;
if (!Array.isArray(results)) {
  throw new Error('The file does not contain exported Promptfoo results.');
}

function percentile(values, fraction) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(sorted.length * fraction) - 1];
}

function commandText(call) {
  return typeof call.args?.command === 'string' ? call.args.command : '';
}

function isGraphifyCall(call) {
  return call.name === 'sero-cli'
    && /(^|\n)\s*graphify_(query|search|path|explain)\b/.test(commandText(call));
}

function isSearchCall(call) {
  return ['bash', 'find', 'grep', 'multi_grep'].includes(call.name)
    || isGraphifyCall(call);
}

function assertionValue(result, name) {
  const reason = result.gradingResult?.componentResults?.[0]?.reason ?? '';
  return new RegExp(`\\b${name}=(true|false)\\b`).exec(reason)?.[1] === 'true';
}

function estimatedCost(result) {
  const usage = result.response?.metadata?.usage;
  const rates = result.response?.metadata?.model?.cost;
  if (!usage || !rates) return 0;
  return (
    (usage.input ?? 0) * (rates.input ?? 0)
    + (usage.output ?? 0) * (rates.output ?? 0)
    + (usage.cacheRead ?? 0) * (rates.cacheRead ?? 0)
    + (usage.cacheWrite ?? 0) * (rates.cacheWrite ?? 0)
  ) / 1_000_000;
}

function sum(items, select) {
  return items.reduce((total, item) => total + select(item), 0);
}

const providers = Map.groupBy(results, (result) => result.provider.label);
const report = [];

for (const [provider, runs] of providers) {
  const completedRuns = runs.filter((result) => result.response?.metadata);
  const runSearchCalls = completedRuns.map((result) => (
    (result.response.metadata.toolCalls ?? []).filter(isSearchCall)
  ));
  const searchCalls = runSearchCalls.flat();
  const usages = completedRuns.map((result) => result.response.metadata.usage ?? {});
  const taskKinds = Map.groupBy(runs, (result) => result.vars.task_kind);
  const byTask = Object.fromEntries([...taskKinds].map(([kind, taskRuns]) => [kind, {
    cases: taskRuns.length,
    completed: taskRuns.filter((result) => assertionValue(result, 'completed')).length,
    answers: taskRuns.filter((result) => assertionValue(result, 'answerFound')).length,
    expectedTool: taskRuns.filter((result) => assertionValue(result, 'expectedTool')).length,
    errors: taskRuns.filter((result) => !result.response?.metadata).length,
  }]));

  report.push({
    provider,
    cases: runs.length,
    passed: runs.filter((result) => result.success).length,
    completed: runs.filter((result) => assertionValue(result, 'completed')).length,
    answers: runs.filter((result) => assertionValue(result, 'answerFound')).length,
    expectedTool: runs.filter((result) => assertionValue(result, 'expectedTool')).length,
    errors: runs.filter((result) => !result.response?.metadata).length,
    searchCalls: searchCalls.length,
    followUpSearches: sum(runSearchCalls, (calls) => Math.max(0, calls.length - 1)),
    resultTokensEstimate: sum(searchCalls, (call) => call.resultTokensEstimate ?? 0),
    medianSearchMs: percentile(searchCalls.map((call) => call.durationMs ?? 0), 0.5),
    medianLatencyMs: percentile(completedRuns.map((result) => result.latencyMs), 0.5),
    p95LatencyMs: percentile(completedRuns.map((result) => result.latencyMs), 0.95),
    usageTokens: sum(usages, (usage) => usage.total ?? 0),
    inputTokens: sum(usages, (usage) => usage.input ?? 0),
    outputTokens: sum(usages, (usage) => usage.output ?? 0),
    cacheReadTokens: sum(usages, (usage) => usage.cacheRead ?? 0),
    cacheWriteTokens: sum(usages, (usage) => usage.cacheWrite ?? 0),
    estimatedCost: sum(completedRuns, estimatedCost),
    systemPromptChars: percentile(
      completedRuns.map((result) => result.response.metadata.snapshot?.systemPromptLength ?? 0),
      0.5,
    ),
    graphifyCalls: searchCalls.filter(isGraphifyCall).length,
    byTask,
  });
}

console.log(JSON.stringify({ evalId: exported.evalId, report }, null, 2));
