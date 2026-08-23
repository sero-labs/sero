#!/usr/bin/env node
import fs from 'node:fs/promises';

const DEFAULT_TARGET_SECONDS = 300;
const EXCLUDED_CONCLUSIONS = new Set(['cancelled', 'skipped']);

function nearestRank(sortedValues, percentile) {
  return sortedValues[Math.max(0, Math.ceil(percentile * sortedValues.length) - 1)];
}

function formatDuration(totalSeconds) {
  const roundedSeconds = Math.round(totalSeconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
}

export function summarizeWorkflowRuns(workflowRuns, targetSeconds = DEFAULT_TARGET_SECONDS) {
  const durations = workflowRuns
    .filter((run) => !EXCLUDED_CONCLUSIONS.has(run.conclusion))
    .map((run) => (Date.parse(run.updated_at) - Date.parse(run.run_started_at)) / 1000)
    .filter((duration) => Number.isFinite(duration) && duration >= 0)
    .sort((left, right) => left - right);
  if (durations.length === 0) throw new Error('No completed workflow durations were available.');
  const p50 = nearestRank(durations, 0.5);
  const p95 = nearestRank(durations, 0.95);
  return {
    sampleSize: durations.length,
    p50Seconds: p50,
    p95Seconds: p95,
    maximumSeconds: durations.at(-1),
    targetSeconds,
    targetMet: p95 <= targetSeconds,
  };
}

export function formatGithubSummary(metrics, workflow) {
  return [
    '## CI feedback time',
    '',
    `Workflow: \`${workflow}\``,
    '',
    '| Measure | Value |',
    '| --- | ---: |',
    `| Runs measured | ${metrics.sampleSize} |`,
    `| p50 | ${formatDuration(metrics.p50Seconds)} |`,
    `| p95 | ${formatDuration(metrics.p95Seconds)} |`,
    `| Maximum | ${formatDuration(metrics.maximumSeconds)} |`,
    `| p95 target | ${formatDuration(metrics.targetSeconds)} |`,
    `| Target met | ${metrics.targetMet ? 'yes' : 'no'} |`,
    '',
    metrics.sampleSize >= 30
      ? 'The sample contains at least 30 completed, non-cancelled runs.'
      : 'Warning: fewer than 30 completed, non-cancelled runs were available.',
  ].join('\n');
}

async function fetchWorkflowRuns(repository, workflow, token) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/actions/workflows/${workflow}/runs?status=completed&per_page=100`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );
  if (!response.ok) throw new Error(`GitHub Actions API returned ${response.status}.`);
  const responseBody = await response.json();
  return responseBody.workflow_runs;
}

function option(argv, name) {
  return argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

function parseWorkflowRuns(content) {
  try {
    const workflowRuns = JSON.parse(content).workflow_runs;
    if (!Array.isArray(workflowRuns)) throw new Error('workflow_runs must be an array.');
    return workflowRuns;
  } catch (error) {
    throw new Error('The workflow metrics input is not valid GitHub Actions run JSON.', { cause: error });
  }
}

async function main(argv) {
  const workflow = option(argv, '--workflow') ?? 'test.yml';
  const targetSeconds = Number(option(argv, '--target-seconds') ?? DEFAULT_TARGET_SECONDS);
  const input = option(argv, '--input');
  const runs = input
    ? parseWorkflowRuns(await fs.readFile(input, 'utf8'))
    : await fetchWorkflowRuns(
      option(argv, '--repo') ?? process.env.GITHUB_REPOSITORY,
      workflow,
      process.env.GITHUB_TOKEN,
    );
  process.stdout.write(`${formatGithubSummary(summarizeWorkflowRuns(runs, targetSeconds), workflow)}\n`);
}

if (process.argv[1]?.endsWith('ci-workflow-metrics.mjs')) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
