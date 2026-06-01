export type PluginDevSessionErrorCode =
  | 'source-package-json-missing'
  | 'source-package-json-read-failed'
  | 'source-package-json-invalid'
  | 'source-app-declaration-invalid'
  | 'source-manifest-parse-failed'
  | 'unsupported-package-manager'
  | 'app-id-drifted'
  | 'app-id-conflict-built-in'
  | 'app-id-conflict-installed-plugin'
  | 'app-id-conflict-active-dev-session';

export interface PluginDevSessionError extends Error {
  code: PluginDevSessionErrorCode;
  cause?: unknown;
}

export function createPluginDevSessionError(
  code: PluginDevSessionErrorCode,
  message: string,
  options: { cause?: unknown } = {},
): PluginDevSessionError {
  const error = new Error(message) as PluginDevSessionError;
  error.name = 'PluginDevSessionError';
  error.code = code;

  if (options.cause !== undefined) {
    error.cause = options.cause;
  }

  return error;
}

function isPluginDevSessionErrorCode(value: unknown): value is PluginDevSessionErrorCode {
  switch (value) {
    case 'source-package-json-missing':
    case 'source-package-json-read-failed':
    case 'source-package-json-invalid':
    case 'source-app-declaration-invalid':
    case 'source-manifest-parse-failed':
    case 'unsupported-package-manager':
    case 'app-id-drifted':
    case 'app-id-conflict-built-in':
    case 'app-id-conflict-installed-plugin':
    case 'app-id-conflict-active-dev-session':
      return true;
    default:
      return false;
  }
}

export function isPluginDevSessionError(error: unknown): error is PluginDevSessionError {
  return error instanceof Error
    && isPluginDevSessionErrorCode((error as { code?: unknown }).code);
}
