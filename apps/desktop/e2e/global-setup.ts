import { cleanupE2eDataRoot } from './helpers/seroHome';

export default async function globalSetup(): Promise<void> {
  cleanupE2eDataRoot();
}
