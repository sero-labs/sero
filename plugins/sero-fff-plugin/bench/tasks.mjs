/**
 * Representative Sero search tasks.
 *
 * Each task is a question an agent actually asks while working in this
 * repository, expressed twice: as the shell search an agent writes today, and
 * as the FFF tool call it would write instead. `answer` is the file that ends
 * the search — the benchmark's proxy for "found it".
 */

export const TASKS = [
  {
    id: 'locate-ipc-contract',
    question: 'Where is the renderer/main IPC contract defined?',
    answer: 'apps/desktop/src/types/ipc.ts',
    rg: { kind: 'files', pattern: 'ipc' },
    fff: { kind: 'find', pattern: 'types ipc' },
  },
  {
    id: 'plugin-bridge-policy',
    question: 'Where is a plugin tool decided to be CLI-bridged?',
    answer: 'apps/desktop/electron/cli/index.ts',
    rg: { kind: 'content', pattern: 'shouldBridgeTool' },
    fff: { kind: 'grep', pattern: 'shouldBridgeTool' },
  },
  {
    id: 'workspace-roots',
    question: 'How are multi-root workspaces stored?',
    answer: 'apps/desktop/electron/features/workspace/roots.ts',
    rg: { kind: 'content', pattern: 'PRIMARY_ROOT_ID' },
    fff: { kind: 'grep', pattern: 'PRIMARY_ROOT_ID' },
  },
  {
    id: 'permission-profile',
    question: 'Where is a persistent session tool list filtered by its profile?',
    answer: 'apps/desktop/electron/features/apps/runtime/capabilities/persistent-sessions/permission-tools.ts',
    rg: { kind: 'content', pattern: 'applyPermissionProfile' },
    fff: { kind: 'grep', pattern: 'applyPermissionProfile' },
  },
  {
    id: 'builtin-plugin-discovery',
    question: 'How does the host discover bundled plugins?',
    answer: 'apps/desktop/electron/platform/protocols/builtin-resources.ts',
    rg: { kind: 'content', pattern: 'discoverBuiltinPluginPaths' },
    fff: { kind: 'grep', pattern: 'discoverBuiltinPluginPaths' },
  },
  {
    id: 'naming-variants',
    question: 'Where is the workspace id container label defined, in any spelling?',
    answer: 'apps/desktop/electron/features/container/core/ownership.ts',
    rg: { kind: 'content', pattern: 'SERO_WORKSPACE_ID_LABEL|ai\\.sero\\.workspaceId' },
    fff: { kind: 'multi_grep', patterns: ['SERO_WORKSPACE_ID_LABEL', 'ai.sero.workspaceId'] },
  },
  {
    id: 'asar-unpack',
    question: 'Which files are unpacked from the asar?',
    answer: 'apps/desktop/electron-builder.yml',
    rg: { kind: 'content', pattern: 'asarUnpack' },
    fff: { kind: 'grep', pattern: 'asarUnpack' },
  },
  {
    id: 'subagent-tool-policy',
    question: 'Which file implements the subagent platform-tool policy?',
    answer: 'apps/desktop/electron/features/subagent/runtime/runner.ts',
    rg: { kind: 'files', pattern: 'subagent.*runner' },
    fff: { kind: 'find', pattern: 'subagent runner' },
  },
];
