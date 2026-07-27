/** `design_library_settings` — the two profile settings in the first release. */

import { StringEnum } from '@earendil-works/pi-ai';
import type { ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { fail, ok, resolvePaths, submitRequest, currentState, type ToolOutput } from '../context';

const Params = Type.Object({
  action: StringEnum(['get', 'set', 'dismiss_notice'] as const),
  variantCount: Type.Optional(Type.Number({ description: 'Variants per run, 1 to 5' })),
  revisionBehaviour: Type.Optional(StringEnum(['replace', 'retain'] as const)),
  noticeId: Type.Optional(Type.String()),
});

export function createSettingsTool(): ToolDefinition<typeof Params> {
  return {
    name: 'design_library_settings',
    label: 'Design Library settings',
    description:
      'Read or change Design Library profile settings. Actions: get, set (variantCount 1-5, '
      + 'revisionBehaviour replace|retain), dismiss_notice (noticeId).',
    parameters: Params,

    async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<ToolOutput> {
      const paths = resolvePaths(ctx?.cwd);

      if (params.action === 'get') {
        const state = await currentState(paths);
        return ok(JSON.stringify(state?.settings ?? {}), { settings: state?.settings });
      }

      if (params.action === 'dismiss_notice') {
        if (!params.noticeId) return fail('noticeId is required.');
        await submitRequest(paths, 'notice.dismiss', { noticeId: params.noticeId });
        return ok('Notice dismissed.');
      }

      if (params.variantCount !== undefined) {
        if (!Number.isInteger(params.variantCount) || params.variantCount < 1 || params.variantCount > 5) {
          return fail('variantCount must be a whole number from 1 to 5.');
        }
      }
      if (params.variantCount === undefined && params.revisionBehaviour === undefined) {
        return fail('Provide variantCount, revisionBehaviour, or both.');
      }

      await submitRequest(paths, 'settings.update', {
        ...(params.variantCount !== undefined ? { variantCount: params.variantCount } : {}),
        ...(params.revisionBehaviour !== undefined ? { revisionBehaviour: params.revisionBehaviour } : {}),
      });
      return ok('Settings update queued.');
    },
  };
}
