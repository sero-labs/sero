/**
 * Every id must be one safe path segment. The leading-character rule excludes
 * `.` and `..`, and the class excludes every separator, so no traversal
 * survives. Renderer-safe so record normalizers do not import Node path code.
 */
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function isSafeId(id: string): boolean {
  return SAFE_ID.test(id);
}
