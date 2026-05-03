/**
 * Node / native module checks.
 */

import { registerDoctorCheck } from '../registry';
import {
  nativeRebuildBetterSqlite3Repair,
  nativeRebuildNodePtyRepair,
} from '../repairs';
import type { DoctorCheck } from '../types';
import { makeResult } from './helpers';

const versionCheck: DoctorCheck = {
  id: 'node.version',
  category: 'node',
  async run() {
    const start = Date.now();
    const version = process.versions.node;
    const major = Number.parseInt(version.split('.')[0] ?? '', 10);
    if (!Number.isFinite(major) || major < 20) {
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'warn',
        message: `Node ${version} is older than the supported range (≥ 20).`,
        start,
      });
    }
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'pass',
      message: `Node ${version}.`,
      start,
    });
  },
};

const abiCheck: DoctorCheck = {
  id: 'node.abi',
  category: 'node',
  async run() {
    const start = Date.now();
    const abi = process.versions.modules;
    return makeResult({
      id: this.id,
      category: this.category,
      status: 'pass',
      message: `Native module ABI v${abi}.`,
      details: { abi },
      start,
    });
  },
};

const nodePtyCheck: DoctorCheck = {
  id: 'node.module.node-pty',
  category: 'node',
  repair: nativeRebuildNodePtyRepair,
  async run() {
    const start = Date.now();
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('node-pty');
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'pass',
        message: 'node-pty loads successfully.',
        start,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'fail',
        message: `node-pty failed to load: ${message}`,
        fix: {
          kind: 'repair',
          repairId: nativeRebuildNodePtyRepair.id,
          description: nativeRebuildNodePtyRepair.description,
          destructive: nativeRebuildNodePtyRepair.destructive,
        },
        start,
      });
    }
  },
};

const betterSqliteCheck: DoctorCheck = {
  id: 'node.module.better-sqlite3',
  category: 'node',
  repair: nativeRebuildBetterSqlite3Repair,
  async run() {
    const start = Date.now();
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Database = require('better-sqlite3');
      const db = new Database(':memory:');
      db.close();
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'pass',
        message: 'better-sqlite3 loads and opens an in-memory DB.',
        start,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return makeResult({
        id: this.id,
        category: this.category,
        status: 'fail',
        message: `better-sqlite3 failed: ${message}`,
        fix: {
          kind: 'repair',
          repairId: nativeRebuildBetterSqlite3Repair.id,
          description: nativeRebuildBetterSqlite3Repair.description,
          destructive: nativeRebuildBetterSqlite3Repair.destructive,
        },
        start,
      });
    }
  },
};

export function registerNodeChecks(): void {
  registerDoctorCheck(versionCheck);
  registerDoctorCheck(abiCheck);
  registerDoctorCheck(nodePtyCheck);
  registerDoctorCheck(betterSqliteCheck);
}
