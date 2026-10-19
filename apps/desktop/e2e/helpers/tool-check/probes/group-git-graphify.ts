import type { ToolProbe } from '../types';
import { gitManagerProbe } from './git-manager';
import { graphifyIndexProbe } from './graphify-index';
import {
  graphifyConfigureProbe,
  graphifyExplainProbe,
  graphifyPathProbe,
  graphifyQueryProbe,
  graphifySearchProbe,
  graphifyStatusProbe,
} from './graphify-read';

/**
 * Order matters. `git_manager` runs first and puts the workspace back as it
 * found it. The `graphify_index` probe builds the graph the reading probes
 * search, and `graphify_configure` runs last.
 */
export const gitGraphifyProbes: ToolProbe[] = [
  gitManagerProbe,
  graphifyIndexProbe,
  graphifySearchProbe,
  graphifyQueryProbe,
  graphifyPathProbe,
  graphifyExplainProbe,
  graphifyStatusProbe,
  graphifyConfigureProbe,
];
