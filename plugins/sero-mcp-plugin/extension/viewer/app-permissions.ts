import type { McpUiResourcePermissions } from '@modelcontextprotocol/ext-apps/app-bridge';
import { askUser, canAskUser } from '../elicitation/ask-user';

type PermissionName = keyof McpUiResourcePermissions;

/**
 * The permissions that Sero can grant, with the words for the question. Sero's
 * Electron session denies geolocation, so Sero never asks for it.
 */
const GRANTABLE: Partial<Record<PermissionName, string>> = {
  camera: 'use the camera',
  microphone: 'use the microphone',
  clipboardWrite: 'write to your clipboard',
};

/** Choices per app (server and resource), kept until the runtime stops. */
export type AppPermissionChoices = Map<string, McpUiResourcePermissions>;

/**
 * Asks once per app before it loads, because the frame gets its permissions
 * at load time and an app cannot ask later. Deny is the default. With nobody
 * to answer, or when the question is cancelled, the app gets no permissions.
 */
export async function chooseAppPermissions(
  requested: McpUiResourcePermissions | undefined,
  options: { appKey: string; appLabel: string; choices: AppPermissionChoices },
): Promise<McpUiResourcePermissions> {
  const names = (Object.keys(requested ?? {}) as PermissionName[]).filter((name) => GRANTABLE[name]);
  if (names.length === 0) return {};
  const remembered = options.choices.get(options.appKey);
  if (remembered) return remembered;
  if (!canAskUser()) return {};

  const answers = await askUser([{
    id: 'app-permissions',
    label: `Allow the app to ${joinPhrases(names.map((name) => GRANTABLE[name] ?? name))}?`,
    prompt: 'Sero keeps your choice for this app until Sero restarts.',
    options: [
      { value: 'deny', label: 'Deny', emphasis: 'primary' },
      { value: 'allow', label: 'Allow' },
    ],
    allowOther: false,
  }], { source: options.appLabel, type: 'question' });
  if (answers === null) return {};

  const granted: McpUiResourcePermissions = answers[0]?.value === 'allow'
    ? Object.fromEntries(names.map((name) => [name, {}]))
    : {};
  options.choices.set(options.appKey, granted);
  return granted;
}

function joinPhrases(phrases: string[]): string {
  return phrases.length <= 1 ? phrases.join('') : `${phrases.slice(0, -1).join(', ')} and ${phrases.at(-1)}`;
}
