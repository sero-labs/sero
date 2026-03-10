/**
 * VCS panel formatting utilities.
 */

/** Format an ISO timestamp as a relative age string: "2m", "1h", "3d", etc. */
export function formatAge(iso: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const secs = Math.floor(diffMs / 1000);
  if (secs < 60) return 'now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

/** Truncate a string with ellipsis. */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/** Get the short filename from a path. */
export function basename(path: string): string {
  return path.split('/').pop() ?? path;
}

/** File status to display code. */
export function statusCode(status: string): string {
  switch (status) {
    case 'modified': return 'M';
    case 'added': return 'A';
    case 'deleted': return 'D';
    case 'renamed': return 'R';
    case 'copied': return 'C';
    case 'conflict': return '!';
    default: return '?';
  }
}

/** File status to color class. */
export function statusColor(status: string): string {
  switch (status) {
    case 'modified': return 'text-[var(--status-warning)]';
    case 'added': return 'text-[var(--status-success)]';
    case 'deleted': return 'text-[var(--status-error)]';
    case 'renamed': return 'text-[var(--status-info)]';
    case 'conflict': return 'text-[var(--status-error)]';
    default: return 'text-[var(--text-muted)]';
  }
}

/** Detect language from file extension for Monaco. */
export function langFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    json: 'json', md: 'markdown', css: 'css', html: 'html', py: 'python',
    rs: 'rust', go: 'go', sh: 'shell', bash: 'shell', yml: 'yaml', yaml: 'yaml',
    toml: 'toml', sql: 'sql', xml: 'xml', svg: 'xml', java: 'java',
    c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp', rb: 'ruby', swift: 'swift',
    kt: 'kotlin', scala: 'scala', lua: 'lua', r: 'r',
  };
  return map[ext] ?? 'plaintext';
}
