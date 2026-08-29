/** Descriptions and result helpers shared by the three search tools. */

export const PATH_DESCRIPTION =
  'Workspace-relative path constraint: a directory prefix (src/, src/foo/), a filename '
  + 'with extension (main.ts), or a glob (*.ts, src/**/*.tsx, {src,lib}/**). Applied to the '
  + 'whole workspace-relative path. Paths outside the workspace are rejected.';

export const EXCLUDE_DESCRIPTION =
  "Paths to exclude (comma/space-separated string or array). Same syntax as `path`: 'test/', "
  + "'config.json', '*.min.js'. A leading '!' is optional. Example: 'test/,*.min.js'.";

export interface TextToolResult {
  content: { type: 'text'; text: string }[];
  details: Record<string, unknown>;
}

export function textResult(text: string, details: Record<string, unknown>): TextToolResult {
  return { content: [{ type: 'text', text }], details };
}
