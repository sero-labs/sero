import { access } from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { CONTAINER_BIN, errorMessage, isXpcError } from './types';

const execFileAsync = promisify(execFile);

export interface ContainerAvailability {
  status: 'available' | 'missing_binary' | 'system_unavailable' | 'startup_failed';
  message: string;
  recommended: boolean;
  runtime: 'apple-container' | 'docker';
}

export async function getContainerAvailability(): Promise<ContainerAvailability> {
  if (process.platform !== 'darwin') return getDockerAvailability();

  try {
    await access(CONTAINER_BIN);
  } catch {
    return {
      status: 'missing_binary',
      message: 'Apple containers are not installed on this Mac. Sero can continue in host mode, but some managed tooling will stay unavailable until the container CLI is installed.',
      recommended: true,
      runtime: 'apple-container',
    };
  }

  try {
    const { stdout } = await execFileAsync(CONTAINER_BIN, ['system', 'status'], {
      timeout: 10_000,
    });

    if (stdout.includes('running')) {
      return {
        status: 'available',
        message: 'Apple containers are available.',
        recommended: true,
        runtime: 'apple-container',
      };
    }

    return {
      status: 'system_unavailable',
      message: 'Apple containers are installed, but the container system is not running. Sero can continue in host mode until it is started.',
      recommended: true,
      runtime: 'apple-container',
    };
  } catch (error) {
    if (isXpcError(error)) {
      return {
        status: 'system_unavailable',
        message: 'Apple containers are installed, but the container system is unavailable right now. Sero can continue in host mode until it is healthy again.',
        recommended: true,
        runtime: 'apple-container',
      };
    }

    return {
      status: 'startup_failed',
      message: `Apple containers could not be verified: ${errorMessage(error)}`,
      recommended: true,
      runtime: 'apple-container',
    };
  }
}

async function getDockerAvailability(): Promise<ContainerAvailability> {
  try {
    const { stdout } = await execFileAsync('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 10_000 });
    return {
      status: 'available',
      message: `Docker is available${stdout.trim() ? ` (${stdout.trim()})` : ''}.`,
      recommended: true,
      runtime: 'docker',
    };
  } catch (error) {
    return {
      status: 'missing_binary',
      message: process.platform === 'win32'
        ? 'Docker Desktop is recommended for full Sero runtime features on Windows. Host runtime is also available when WSL 2 is installed.'
        : 'Docker is recommended for full Sero runtime features on this platform. Host runtime remains available without containers.',
      recommended: true,
      runtime: 'docker',
    };
  }
}
