/**
 * What a tool check run did, per runtime, and the check that fails the run
 * when anything did not run.
 *
 * The comparison is against the probe table, not the inventory. The
 * inventory loads Electron main code, which Playwright cannot import, and the
 * coverage check already proves the table matches the inventory.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { ToolCheckRuntime, ToolCheckSite, ToolProbe } from './types';

export interface LedgerRow {
  runtime: ToolCheckRuntime;
  site: ToolCheckSite;
  tool: string;
  action: string | null;
  result: 'pass' | 'fail';
  ms: number;
  error?: string;
}

export interface PlannedAction {
  tool: string;
  action: string | null;
  site: ToolCheckSite;
}

export interface Ledger {
  runtime: ToolCheckRuntime;
  /** Where the action pass meant to run each action. */
  planned: PlannedAction[];
  /** The tools each site's session was given, read from the live session. */
  siteTools: Partial<Record<ToolCheckSite, string[]>>;
  rows: LedgerRow[];
}

export function ledgerPath(dir: string, runtime: ToolCheckRuntime): string {
  return path.join(dir, `ledger-${runtime}.json`);
}

/** Keeps the ledger on disk after every change, so a run that dies still leaves its record. */
export class LedgerWriter {
  readonly ledger: Ledger;

  constructor(private readonly file: string, runtime: ToolCheckRuntime) {
    this.ledger = { runtime, planned: [], siteTools: {}, rows: [] };
    this.flush();
  }

  plan(entries: PlannedAction[]): void {
    this.ledger.planned.push(...entries);
    this.flush();
  }

  siteTools(site: ToolCheckSite, tools: string[]): void {
    this.ledger.siteTools[site] = [...tools].sort();
    this.flush();
  }

  record(row: Omit<LedgerRow, 'runtime'>): void {
    this.ledger.rows.push({ runtime: this.ledger.runtime, ...row });
    this.flush();
  }

  private flush(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(this.ledger, null, 2));
    fs.renameSync(temporary, this.file);
  }
}

function label(tool: string, action: string | null): string {
  return action === null ? tool : `${tool} ${action}`;
}

const same = (tool: string, action: string | null) => (row: { tool: string; action: string | null }) =>
  row.tool === tool && row.action === action;

function latestBySite(rows: LedgerRow[]): LedgerRow[] {
  return [...new Map(rows.map((row) => [row.site, row])).values()];
}

/** Every action the table gives a scenario, minus the exempt ones. */
export function requiredActions(probes: ToolProbe[]): Array<{ tool: string; action: string | null }> {
  return probes.flatMap((probe) => {
    const exempt = new Set((probe.exemptions ?? []).map((exemption) => exemption.action));
    const actions = [...new Set(probe.steps.map((step) => step.action))].filter((action) => !exempt.has(action));
    return actions.map((action) => ({ tool: probe.tool, action }));
  });
}

/** Tools with no action left to run once their exemptions are taken out. */
function fullyExemptTools(probes: ToolProbe[]): Set<string> {
  return new Set(probes.filter((probe) => probe.steps.length === 0 && (probe.exemptions?.length ?? 0) > 0).map((probe) => probe.tool));
}

/**
 * One line per thing the run did not prove: a required action with no passing
 * row, a failed row, or a tool a site was given that never ran there. Each
 * line names the action, the site and the runtime.
 */
export function ledgerProblems(ledger: Ledger, probes: ToolProbe[]): string[] {
  const problems: string[] = [];
  const runtime = ledger.runtime;
  for (const { tool, action } of requiredActions(probes)) {
    // A site's latest row decides it there: a later failure, such as a turn
    // that never ended, overrides the pass the driver recorded first.
    const latest = latestBySite(ledger.rows.filter(same(tool, action)));
    if (latest.some((row) => row.result === 'pass')) continue;
    const failed = latest.find((row) => row.result === 'fail');
    if (failed) {
      problems.push(`failed: ${label(tool, action)} at ${failed.site} on ${runtime}: ${failed.error ?? 'no detail'}`);
      continue;
    }
    const planned = ledger.planned.find(same(tool, action));
    problems.push(planned
      ? `not run: ${label(tool, action)} at ${planned.site} on ${runtime}`
      : `not run: ${label(tool, action)} on ${runtime}, and no site was planned for it`);
  }

  const exempt = fullyExemptTools(probes);
  for (const [site, tools] of Object.entries(ledger.siteTools) as Array<[ToolCheckSite, string[]]>) {
    for (const tool of tools) {
      if (exempt.has(tool)) continue;
      const rows = ledger.rows.filter((row) => row.site === site && row.tool === tool);
      if (rows.some((row) => row.result === 'pass')) continue;
      const failed = rows.find((row) => row.result === 'fail');
      problems.push(failed
        ? `failed: ${tool} at ${site} on ${runtime}: ${failed.error ?? 'no detail'}`
        : `not run: ${tool} at ${site} on ${runtime}, which the site was given`);
    }
  }
  return problems;
}

/** The run report's list of what it did not prove on purpose. */
export function exemptionReport(probes: ToolProbe[]): string[] {
  return probes.flatMap((probe) => (probe.exemptions ?? []).map((exemption) =>
    `${label(probe.tool, exemption.action)}: ${exemption.reason}. ${exemption.detail}`));
}
