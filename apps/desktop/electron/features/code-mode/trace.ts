export interface NestedCallTraceEntry {
  tool: string;
  status: 'completed' | 'failed';
  durationMs: number;
}

export interface NestedCallTraceOverflow {
  tool: string;
  status: 'completed' | 'failed';
  count: number;
}

export interface NestedCallTraceSummary {
  calls: NestedCallTraceEntry[];
  omitted: NestedCallTraceOverflow[];
}

const MAX_TRACE_ENTRIES = 50;

export class NestedCallTrace {
  private readonly entries: NestedCallTraceEntry[] = [];
  private readonly overflow = new Map<string, NestedCallTraceOverflow>();

  record(entry: NestedCallTraceEntry): void {
    if (this.entries.length < MAX_TRACE_ENTRIES) {
      this.entries.push(entry);
      return;
    }

    const key = `${entry.tool}:${entry.status}`;
    const current = this.overflow.get(key);
    if (current) {
      current.count += 1;
    } else {
      this.overflow.set(key, { tool: entry.tool, status: entry.status, count: 1 });
    }
  }

  summary(): NestedCallTraceSummary {
    return {
      calls: [...this.entries],
      omitted: [...this.overflow.values()],
    };
  }
}
