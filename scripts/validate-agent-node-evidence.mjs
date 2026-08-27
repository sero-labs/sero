#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const structureOnly = args.includes('--check-structure');
const fileArg = args.find((arg) => arg !== '--check-structure');

if (!fileArg) {
  console.error('Usage: validate-agent-node-evidence.mjs [--check-structure] <evidence.json>');
  process.exit(2);
}

const evidencePath = path.resolve(fileArg);
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
const errors = [];

if (evidence.schemaVersion !== 1) {
  errors.push('schemaVersion must be 1');
}

if (!Array.isArray(evidence.targets)) {
  errors.push('targets must be an array');
}

const targetDefinitions = [
  { id: 'linux-x64', arch: 'x64' },
  { id: 'linux-arm64-spark', arch: 'arm64' },
];

function checkResult(targetId, name, result) {
  if (!result || !['passed', 'failed', 'not-run'].includes(result.status)) {
    errors.push(`${targetId}.${name}.status must be passed, failed, or not-run`);
    return;
  }

  if (structureOnly || result.status !== 'passed') {
    if (!structureOnly) errors.push(`${targetId}.${name} must have status passed`);
    return;
  }

  if (typeof result.command !== 'string' || result.command.trim() === '') {
    errors.push(`${targetId}.${name}.command must record the command`);
  }
  if (typeof result.output !== 'string' || result.output.trim() === '') {
    errors.push(`${targetId}.${name}.output must record the output`);
  }
}

if (Array.isArray(evidence.targets)) {
  for (const definition of targetDefinitions) {
    const target = evidence.targets.find((item) => item?.id === definition.id);
    if (!target) {
      errors.push(`missing target ${definition.id}`);
      continue;
    }
    if (target.platform !== 'linux' || target.arch !== definition.arch) {
      errors.push(`${definition.id} must be linux ${definition.arch}`);
    }

    checkResult(definition.id, 'binary', target.binary);
    checkResult(definition.id, 'systemdSecurity', target.systemdSecurity);
    checkResult(definition.id, 'tck', target.tck);
    checkResult(definition.id, 'itk', target.itk);

    if (target.systemdSecurity?.status === 'passed'
      && !target.systemdSecurity.command.includes('systemd-analyze security')) {
      errors.push(`${definition.id}.systemdSecurity.command must run systemd-analyze security`);
    }

    if (definition.id === 'linux-arm64-spark') {
      checkResult(definition.id, 'hardware', target.hardware);
      if (!structureOnly && target.hardware?.status === 'passed') {
        if (target.hardware.verifiedOnHardware !== true) {
          errors.push(`${definition.id}.hardware.verifiedOnHardware must be true`);
        }
        if (!/DGX Spark/i.test(target.hardware.model ?? '')) {
          errors.push(`${definition.id}.hardware.model must identify DGX Spark`);
        }
      }
    }
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

const mode = structureOnly ? 'structure' : 'release evidence';
console.log(`Agent Node ${mode} is valid for linux-x64 and linux-arm64-spark.`);
