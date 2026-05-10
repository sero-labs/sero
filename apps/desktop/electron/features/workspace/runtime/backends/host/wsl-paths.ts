import { posix } from 'path';

const WINDOWS_DRIVE_PATH_RE = /^([a-zA-Z]):[\\/]*(.*)$/;
const WSL_UNC_PATH_RE = /^[\\/]{2}(wsl\$|wsl\.localhost)[\\/]+([^\\/]+)(?:[\\/]*(.*))?$/i;
const WSL_MOUNT_RE = /^\/mnt\/([a-zA-Z])(?:\/|$)/;

export interface WslUncPathParts {
  prefix: 'wsl$' | 'wsl.localhost';
  distro: string;
  path: string;
}

export function isWindowsDrivePath(path: string): boolean {
  return WINDOWS_DRIVE_PATH_RE.test(path);
}

export function parseWslUncPath(path: string): WslUncPathParts | null {
  const match = WSL_UNC_PATH_RE.exec(path);
  if (!match) return null;

  const prefix = match[1].toLowerCase() === 'wsl$' ? 'wsl$' : 'wsl.localhost';
  return {
    prefix,
    distro: match[2],
    path: canonicalizeWslExecutionPath(`/${match[3] ?? ''}`),
  };
}

export function isWslUncPath(path: string): boolean {
  return parseWslUncPath(path) !== null;
}

export function extractWslDistro(path: string): string | null {
  return parseWslUncPath(path)?.distro ?? null;
}

export function canonicalizeWslExecutionPath(path: string): string {
  const slashPath = path.replace(/\\/g, '/');
  const absolutePath = slashPath.startsWith('/') ? slashPath : `/${slashPath}`;
  const normalized = posix.normalize(absolutePath);
  const withDriveCase = normalized.replace(WSL_MOUNT_RE, (_, drive: string) => `/mnt/${drive.toLowerCase()}/`);
  return withDriveCase.length > 1 && withDriveCase.endsWith('/') ? withDriveCase.slice(0, -1) : withDriveCase;
}

export function toWslPath(nativeOrExecutionPath: string): string {
  const unc = parseWslUncPath(nativeOrExecutionPath);
  if (unc) return unc.path;

  const drive = WINDOWS_DRIVE_PATH_RE.exec(nativeOrExecutionPath);
  if (drive) {
    const driveLetter = drive[1].toLowerCase();
    const remainder = drive[2].replace(/\\/g, '/');
    return canonicalizeWslExecutionPath(`/mnt/${driveLetter}/${remainder}`);
  }

  return canonicalizeWslExecutionPath(nativeOrExecutionPath);
}

export function toWindowsDrivePath(nativeOrExecutionPath: string): string {
  const drive = WINDOWS_DRIVE_PATH_RE.exec(nativeOrExecutionPath);
  if (drive) return nativeOrExecutionPath.replace(/\//g, '\\');

  const executionPath = toWslPath(nativeOrExecutionPath);
  const mount = WSL_MOUNT_RE.exec(executionPath);
  if (!mount) return nativeOrExecutionPath.replace(/\//g, '\\');

  const remainder = executionPath.slice(`/mnt/${mount[1]}`.length).replace(/\//g, '\\');
  return `${mount[1].toUpperCase()}:${remainder}`;
}

export function isWslPathInsideRoot(nativeOrExecutionPath: string, root: string): boolean {
  const candidateDistro = extractWslDistro(nativeOrExecutionPath);
  const rootDistro = extractWslDistro(root);
  if (candidateDistro && rootDistro && candidateDistro.toLowerCase() !== rootDistro.toLowerCase()) {
    return false;
  }

  const candidatePath = toWslPath(nativeOrExecutionPath);
  const rootPath = toWslPath(root);
  return candidatePath === rootPath || candidatePath.startsWith(`${rootPath}/`);
}

export function assertSameWslDistroForAdditionalRoots(mainRoot: string, additionalRoots: string[]): void {
  const mainDistro = extractWslDistro(mainRoot);
  if (!mainDistro) return;

  for (const additionalRoot of additionalRoots) {
    const additionalDistro = extractWslDistro(additionalRoot);
    if (additionalDistro && additionalDistro.toLowerCase() !== mainDistro.toLowerCase()) {
      throw new Error(
        `Additional root ${additionalRoot} uses WSL distro ${additionalDistro}, but workspace root uses ${mainDistro}. Mixed WSL distros are not supported.`,
      );
    }
  }
}
