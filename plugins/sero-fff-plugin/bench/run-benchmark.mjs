#!/usr/bin/env node
/** Controlled A/B benchmark for exhaustive `rg` and the registered FFF tools. */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createAgentSession,
  DefaultResourceLoader,
  SessionManager,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';

import { TASKS } from './tasks.mjs';

const DEFAULT_LIMIT = 20;
const EXTENSION_PATH = fileURLToPath(new URL('../extension/index.ts', import.meta.url));

function parseArgs(argv) {
  const args = { repo: process.cwd(), json: null, iterations: 10 };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--repo') args.repo = path.resolve(argv[index + 1]);
    if (argv[index] === '--json') args.json = path.resolve(argv[index + 1]);
    if (argv[index] === '--iterations') args.iterations = Number(argv[index + 1]);
  }
  if (!Number.isInteger(args.iterations) || args.iterations < 1) {
    throw new Error('--iterations must be a positive integer');
  }
  return args;
}

function tokensEstimate(text) {
  return Math.ceil(text.length / 4);
}

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function summarizeSamples(samples) {
  return {
    medianMs: Number(percentile(samples.map((sample) => sample.elapsedMs), 0.5).toFixed(2)),
    p95Ms: Number(percentile(samples.map((sample) => sample.elapsedMs), 0.95).toFixed(2)),
    medianResultTokensEstimate: percentile(
      samples.map((sample) => sample.resultTokensEstimate),
      0.5,
    ),
    found: samples.filter((sample) => sample.found).length,
    runs: samples.length,
  };
}

function answerPosition(output, answer) {
  const index = output.split('\n').filter(Boolean).findIndex((line) => line.includes(answer));
  return index === -1 ? null : index + 1;
}

function runRipgrep(repo, task) {
  const commandArgs = task.rg.kind === 'files'
    ? ['--files']
    : ['--no-heading', '--line-number', '--color', 'never', task.rg.pattern, '.'];
  const started = process.hrtime.bigint();
  let stdout = '';
  try {
    stdout = execFileSync('rg', commandArgs, {
      cwd: repo,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (error) {
    if (error.status !== 1) throw error;
  }
  let allLines = stdout.split('\n').filter(Boolean);
  if (task.rg.kind === 'files') {
    const filter = new RegExp(task.rg.pattern, 'i');
    allLines = allLines.filter((line) => filter.test(line));
  }
  const returnedOutput = allLines.slice(0, DEFAULT_LIMIT).join('\n');
  return {
    elapsedMs: Number(process.hrtime.bigint() - started) / 1e6,
    resultTokensEstimate: tokensEstimate(returnedOutput),
    resultChars: returnedOutput.length,
    resultLines: Math.min(allLines.length, DEFAULT_LIMIT),
    exhaustiveLines: allLines.length,
    exhaustiveFound: allLines.some((line) => line.includes(task.answer)),
    found: returnedOutput.includes(task.answer),
    answerPosition: answerPosition(returnedOutput, task.answer),
  };
}

function fffParams(task) {
  if (task.fff.kind === 'find') return { pattern: task.fff.pattern, limit: DEFAULT_LIMIT };
  if (task.fff.kind === 'multi_grep') return { patterns: task.fff.patterns, limit: DEFAULT_LIMIT };
  return { pattern: task.fff.pattern, limit: DEFAULT_LIMIT };
}

function resultText(result) {
  return result.content
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

async function runFff(session, task) {
  const tool = session.extensionRunner.getToolDefinition(task.fff.kind);
  if (!tool) throw new Error(`Registered tool ${task.fff.kind} is unavailable`);
  const started = process.hrtime.bigint();
  const result = await tool.execute(
    `bench-${task.id}`,
    fffParams(task),
    undefined,
    undefined,
    session.extensionRunner.createContext(),
  );
  const output = resultText(result);
  return {
    elapsedMs: Number(process.hrtime.bigint() - started) / 1e6,
    resultTokensEstimate: tokensEstimate(output),
    resultChars: output.length,
    resultLines: output.split('\n').filter(Boolean).length,
    found: output.includes(task.answer),
    answerPosition: answerPosition(output, task.answer),
  };
}

async function createFffSession(repo, agentDir) {
  const settingsManager = SettingsManager.create(repo, agentDir);
  const loader = new DefaultResourceLoader({
    cwd: repo,
    agentDir,
    settingsManager,
    additionalExtensionPaths: [EXTENSION_PATH],
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await loader.reload();
  if (loader.getExtensions().errors.length > 0) {
    throw new Error(loader.getExtensions().errors.map((entry) => entry.error).join('; '));
  }
  const { session } = await createAgentSession({
    cwd: repo,
    agentDir,
    noTools: 'builtin',
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(repo),
    settingsManager,
  });
  const started = process.hrtime.bigint();
  await session.bindExtensions({});
  return { session, indexReadyMs: Number(process.hrtime.bigint() - started) / 1e6 };
}

function rotateTasks(iteration) {
  const offset = iteration % TASKS.length;
  return [...TASKS.slice(offset), ...TASKS.slice(0, offset)];
}

function formatTable(rows) {
  const header = ['task', 'rg median', 'fff median', 'rg p95', 'fff p95', 'rg tokens~', 'fff tokens~', 'rg found', 'fff found'];
  const widths = header.map((name, column) => Math.max(
    name.length,
    ...rows.map((row) => String(row[column]).length),
  ));
  const line = (cells) => `| ${cells.map((cell, column) => String(cell).padEnd(widths[column])).join(' | ')} |`;
  return [line(header), `|${widths.map((width) => '-'.repeat(width + 2)).join('|')}|`, ...rows.map(line)].join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.repo)) throw new Error(`No such repository: ${args.repo}`);

  const tempAgentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-fff-bench-'));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = tempAgentDir;
  const rssBeforeMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  let session;

  try {
    const created = await createFffSession(args.repo, tempAgentDir);
    session = created.session;
    runRipgrep(args.repo, { rg: { kind: 'content', pattern: 'warmup-pass-marker' }, answer: '' });

    const samples = Object.fromEntries(TASKS.map((task) => [task.id, { rg: [], fff: [] }]));
    for (let iteration = 0; iteration < args.iterations; iteration += 1) {
      for (const task of rotateTasks(iteration)) {
        if (iteration % 2 === 0) {
          samples[task.id].rg.push(runRipgrep(args.repo, task));
          samples[task.id].fff.push(await runFff(session, task));
        } else {
          samples[task.id].fff.push(await runFff(session, task));
          samples[task.id].rg.push(runRipgrep(args.repo, task));
        }
      }
    }

    const indexedFiles = runRipgrep(args.repo, {
      rg: { kind: 'files', pattern: '.*' },
      answer: '__not_a_file__',
    }).exhaustiveLines;
    const results = TASKS.map((task) => ({
      id: task.id,
      question: task.question,
      rg: summarizeSamples(samples[task.id].rg),
      fff: summarizeSamples(samples[task.id].fff),
    }));
    const aggregate = (arm, field) => results.reduce((sum, result) => sum + result[arm][field], 0);
    const summary = {
      repo: args.repo,
      iterations: args.iterations,
      outputLimit: DEFAULT_LIMIT,
      indexedFiles,
      initialIndexReadyMs: Number(created.indexReadyMs.toFixed(2)),
      rssBeforeIndexMb: rssBeforeMb,
      processMaxRssMb: Math.round(process.resourceUsage().maxRSS / 1024),
      tasks: TASKS.length,
      rg: {
        medianTaskWallMs: Number(aggregate('rg', 'medianMs').toFixed(2)),
        medianResultTokensEstimate: aggregate('rg', 'medianResultTokensEstimate'),
        foundRuns: aggregate('rg', 'found'),
      },
      fff: {
        medianTaskWallMs: Number(aggregate('fff', 'medianMs').toFixed(2)),
        medianResultTokensEstimate: aggregate('fff', 'medianResultTokensEstimate'),
        foundRuns: aggregate('fff', 'found'),
      },
    };
    const rows = results.map((result) => [
      result.id,
      result.rg.medianMs,
      result.fff.medianMs,
      result.rg.p95Ms,
      result.fff.p95Ms,
      result.rg.medianResultTokensEstimate,
      result.fff.medianResultTokensEstimate,
      `${result.rg.found}/${result.rg.runs}`,
      `${result.fff.found}/${result.fff.runs}`,
    ]);

    console.log(`\nRepository: ${summary.repo}`);
    console.log(`Runs per task and arm: ${summary.iterations}`);
    console.log(`Equal returned-result limit: ${summary.outputLimit}`);
    console.log(`Indexed files: ${summary.indexedFiles}`);
    console.log(`FFF index ready: ${summary.initialIndexReadyMs} ms`);
    console.log(`RSS baseline / process max: ${summary.rssBeforeIndexMb} / ${summary.processMaxRssMb} MB\n`);
    console.log(formatTable(rows));
    console.log(`\nMedian result tokens~  rg ${summary.rg.medianResultTokensEstimate}  →  fff ${summary.fff.medianResultTokensEstimate}`);
    console.log(`Median task wall time  rg ${summary.rg.medianTaskWallMs} ms  →  fff ${summary.fff.medianTaskWallMs} ms`);
    console.log(`Answer in results      rg ${summary.rg.foundRuns}/${TASKS.length * args.iterations}  →  fff ${summary.fff.foundRuns}/${TASKS.length * args.iterations}`);

    if (args.json) {
      fs.mkdirSync(path.dirname(args.json), { recursive: true });
      fs.writeFileSync(args.json, `${JSON.stringify({ summary, results }, null, 2)}\n`);
      console.log(`\nWrote ${args.json}`);
    }
  } finally {
    try {
      if (session) {
        await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' });
      }
    } finally {
      session?.dispose();
      if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
      else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
      fs.rmSync(tempAgentDir, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
