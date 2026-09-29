import { removePiDocsSection } from './strip-pi-docs-section';
import { getHostPiDocsPaths } from './shared-pi-docs';

/**
 * Give a host session the one pointer to the Pi docs: the shared copy, which its file tools can
 * read. Pi's own section names Pi's installed package, which they cannot.
 */
export function withHostPiDocsPointer(systemPrompt: string): string {
  return `${removePiDocsSection(systemPrompt)}\n\nPi docs: \`${getHostPiDocsPaths().root}\``;
}
