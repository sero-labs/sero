import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const validator = path.join(scriptsDir, 'validate-agent-node-evidence.mjs');
const template = path.join(scriptsDir, 'agent-node-validation-evidence.json');

function run(args) {
  return spawnSync(process.execPath, [validator, ...args], { encoding: 'utf8' });
}

test('the tracked template has the required two-target structure', () => {
  const result = run(['--check-structure', template]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /linux-x64 and linux-arm64-spark/);
});

test('incomplete evidence cannot pass a release check', () => {
  const result = run([template]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /linux-x64\.binary must have status passed/);
  assert.match(result.stderr, /linux-arm64-spark\.hardware must have status passed/);
});

test('complete Linux, systemd, Spark, TCK, and ITK evidence passes', () => {
  const evidence = JSON.parse(fs.readFileSync(template, 'utf8'));
  for (const target of evidence.targets) {
    target.binary = { status: 'passed', command: './sero-agent-node --version', output: '0.1.0' };
    target.systemdSecurity = {
      status: 'passed',
      command: 'systemd-analyze security sero-agent-node.service',
      output: 'Exposure level: 2.1 OK',
    };
    target.tck = { status: 'passed', command: 'a2a-tck run', output: 'all tests passed' };
    target.itk = { status: 'passed', command: 'a2a-itk run', output: 'all tests passed' };
  }
  evidence.targets[1].hardware = {
    status: 'passed',
    verifiedOnHardware: true,
    model: 'NVIDIA DGX Spark',
    command: 'uname -m && cat /sys/firmware/devicetree/base/model',
    output: 'aarch64\nNVIDIA DGX Spark',
  };

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'sero-node-evidence-'));
  const evidencePath = path.join(directory, 'evidence.json');
  fs.writeFileSync(evidencePath, JSON.stringify(evidence));
  const result = run([evidencePath]);
  fs.rmSync(directory, { recursive: true });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /release evidence is valid/);
});
