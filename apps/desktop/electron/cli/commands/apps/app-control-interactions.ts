import { fail, ok, parseFlags, requireFlagString, stringifyJson } from '@electron/cli/lib/utils';
import type { AppInteractionParams } from '@/types/ipc';
import { appControlHostService } from '@electron/features/apps/app-control/host-service';
import {
  isCliResult,
  okWithImage,
  parseAmountFlag,
  parseCoordinateFlags,
} from './app-control-shared';

async function interactAndReturn(params: AppInteractionParams) {
  const result = await appControlHostService.interact(params);
  if (!result.success) return fail(result.message);
  if (result.inspection) {
    return ok(stringifyJson(result.inspection));
  }
  if (result.screenshot) {
    return okWithImage(result.message, result.screenshot);
  }
  return ok(result.message);
}

export async function handleClick(args: string[]) {
  const { positionals, flags } = parseFlags(args);
  const selector = positionals[0] ?? null;
  const pointResult = parseCoordinateFlags(flags, 'Usage: sero app click <selector> OR sero app click --x <n> --y <n>');
  if (pointResult && isCliResult(pointResult)) return pointResult;
  const point = pointResult ?? null;

  const params: AppInteractionParams = { action: 'click' };
  if (selector) params.selector = selector;
  else if (point) {
    params.x = point.x;
    params.y = point.y;
  } else {
    return fail('Usage: sero app click <selector> OR sero app click --x <n> --y <n>');
  }
  return interactAndReturn(params);
}

export async function handleType(args: string[]) {
  const { positionals, flags } = parseFlags(args);
  const text = positionals[0];
  if (!text) return fail('Usage: sero app type "<text>" [--selector <sel>]');
  return interactAndReturn({
    action: 'type',
    text,
    selector: requireFlagString(flags, 'selector') ?? undefined,
  });
}

export async function handleScroll(args: string[]) {
  const { flags } = parseFlags(args);
  const direction = (requireFlagString(flags, 'direction') ?? 'down') as AppInteractionParams['direction'];
  const amount = parseAmountFlag(flags);
  if (typeof amount !== 'number') return amount;

  return interactAndReturn({
    action: 'scroll',
    direction,
    amount,
    selector: requireFlagString(flags, 'selector') ?? undefined,
  });
}

export async function handleSelect(args: string[]) {
  if (!args[0]) return fail('Usage: sero app select <selector>');
  return interactAndReturn({ action: 'select', selector: args[0] });
}

export async function handleHover(args: string[]) {
  if (!args[0]) return fail('Usage: sero app hover <selector>');
  return interactAndReturn({ action: 'hover', selector: args[0] });
}

export async function handleInspect(args: string[]) {
  const { positionals, flags } = parseFlags(args);
  const selector = positionals[0] ?? requireFlagString(flags, 'selector') ?? undefined;
  const pointResult = parseCoordinateFlags(flags, 'Usage: sero app inspect [<selector>] [--x <n> --y <n>]');
  if (pointResult && isCliResult(pointResult)) return pointResult;
  const point = pointResult ?? null;
  if (selector && point) {
    return fail('Use either a selector or --x/--y coordinates for inspect, not both.');
  }

  const params: AppInteractionParams = { action: 'inspect', captureAfter: false };
  if (selector) params.selector = selector;
  else if (point) {
    params.x = point.x;
    params.y = point.y;
  }
  return interactAndReturn(params);
}

export async function handleGetText(args: string[]) {
  const { flags } = parseFlags(args);
  const selector = requireFlagString(flags, 'selector') ?? args[0] ?? undefined;
  const result = await appControlHostService.interact({ action: 'get-text', selector, captureAfter: false });
  if (!result.success) return fail(result.message);
  return ok(result.textContent ?? '(empty)');
}
