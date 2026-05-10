import { runDockerDoctorChecks } from '@electron/features/workspace/runtime/backends/docker/docker-doctor';
import { registerDoctorCheck } from '../registry';
import type { DoctorCheck } from '../types';

const dockerRuntimeCheck: DoctorCheck = {
  id: 'runtime.docker',
  category: 'runtime',
  slow: true,
  async run() {
    return runDockerDoctorChecks();
  },
};

export function registerRuntimeDockerChecks(): void {
  registerDoctorCheck(dockerRuntimeCheck);
}
