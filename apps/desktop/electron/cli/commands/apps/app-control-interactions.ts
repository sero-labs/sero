import { fail, ok, parseFlags, requireFlagString, stringifyJson } from '@electron/cli/lib/utils';
import type { CliCommandContext, CliResult } from '@electron/cli/core/types';
import type { AppInteractionParams } from '@/types/ipc';
import { appControlHostService } from '@electron/features/apps/app-control/host-service';
import {
  buildScreenshotDescription,
  isCliResult,
  isResolvedAppResult,
  okWithImage,
  openResolvedAppAndWaitForPanel,
  parseAmountFlag,
  parseCoordinateFlags,
  parseFiniteFlagValue,
  saveScreenshot,
} from './app-control-shared';

async function openAppFromFlags(flags: ReturnType<typeof parseFlags>['flags']): Promise<CliResult | null> {
  const targetApp = requireFlagString(flags, 'app');
  if (!targetApp) return null;
  const opened = await openResolvedAppAndWaitForPanel(targetApp);
  return isResolvedAppResult(opened) ? null : opened;
}

async function interactAndReturn(params: AppInteractionParams, flags?: ReturnType<typeof parseFlags>['flags']) {
  if (flags) {
    const openError = await openAppFromFlags(flags);
    if (openError) return openError;
  }
  const result = await appControlHostService.interact(params);
  if (!result.success) return fail(result.message);
  if (result.inspection) {
    return ok(stringifyJson(result.inspection));
  }
  if (result.snapshot) {
    return ok(stringifyJson(result.snapshot));
  }
  if (result.scrollContainers) {
    return ok(stringifyJson(result.scrollContainers));
  }
  if (result.screenshot) {
    return okWithImage(result.message, result.screenshot);
  }
  return ok(result.message);
}

function applyCommonOptions(params: AppInteractionParams, flags: ReturnType<typeof parseFlags>['flags']): CliResult | null {
  params.withinSelector = requireFlagString(flags, 'within') ?? undefined;
  params.containerText = requireFlagString(flags, 'container') ?? undefined;
  if (flags.has('visible-only')) params.visibleOnly = true;
  if (flags.has('interactive-only')) params.interactiveOnly = true;
  const limitValue = requireFlagString(flags, 'limit');
  if (!limitValue) return null;
  const limit = parseFiniteFlagValue(limitValue);
  if (limit == null || limit < 1) return fail('--limit must be a positive number.');
  params.limit = Math.floor(limit);
  return null;
}

function applyElementTarget(
  params: AppInteractionParams,
  flags: ReturnType<typeof parseFlags>['flags'],
  positional?: string,
  includeText = true,
): boolean {
  const selector = positional ?? requireFlagString(flags, 'selector') ?? undefined;
  const ref = requireFlagString(flags, 'ref') ?? undefined;
  const text = includeText ? requireFlagString(flags, 'text') ?? undefined : undefined;
  if (selector) params.selector = selector;
  if (ref) params.ref = ref;
  if (text) params.text = text;
  return Boolean(selector || ref || text);
}

export async function handleClick(args: string[]) {
  const { positionals, flags } = parseFlags(args);
  const pointResult = parseCoordinateFlags(flags, 'Usage: sero app click <selector> OR sero app click --x <n> --y <n>');
  if (pointResult && isCliResult(pointResult)) return pointResult;
  const point = pointResult ?? null;

  const params: AppInteractionParams = { action: 'click' };
  const optionsError = applyCommonOptions(params, flags);
  if (optionsError) return optionsError;
  const hasTarget = applyElementTarget(params, flags, positionals[0]);
  if (hasTarget) return interactAndReturn(params, flags);
  else if (point) {
    params.x = point.x;
    params.y = point.y;
  } else {
    return fail('Usage: sero app click <selector> OR sero app click --x <n> --y <n>');
  }
  return interactAndReturn(params, flags);
}

export async function handleType(args: string[]) {
  const { positionals, flags } = parseFlags(args);
  const text = positionals[0];
  if (!text) return fail('Usage: sero app type "<text>" [--selector <sel>]');
  const params: AppInteractionParams = { action: 'type', text };
  const optionsError = applyCommonOptions(params, flags);
  if (optionsError) return optionsError;
  applyElementTarget(params, flags, undefined, false);
  return interactAndReturn(params, flags);
}

export async function handleScroll(args: string[]) {
  const { flags } = parseFlags(args);
  const direction = (requireFlagString(flags, 'direction') ?? 'down') as AppInteractionParams['direction'];
  const amount = parseAmountFlag(flags);
  if (typeof amount !== 'number') return amount;
  const deltaX = parseFiniteFlagValue(requireFlagString(flags, 'x') ?? requireFlagString(flags, 'deltaX'));
  const deltaY = parseFiniteFlagValue(requireFlagString(flags, 'y') ?? requireFlagString(flags, 'deltaY'));
  if ((flags.has('x') || flags.has('deltaX')) && deltaX == null) return fail('--x/--deltaX must be a finite number.');
  if ((flags.has('y') || flags.has('deltaY')) && deltaY == null) return fail('--y/--deltaY must be a finite number.');
  const atX = parseFiniteFlagValue(requireFlagString(flags, 'at-x'));
  const atY = parseFiniteFlagValue(requireFlagString(flags, 'at-y'));
  if ((flags.has('at-x') || flags.has('at-y')) && (atX == null || atY == null)) {
    return fail('Use both --at-x and --at-y with finite numbers.');
  }

  const params: AppInteractionParams = { action: 'scroll', direction, amount };
  const optionsError = applyCommonOptions(params, flags);
  if (optionsError) return optionsError;
  applyElementTarget(params, flags);
  if (deltaX != null) params.deltaX = deltaX;
  if (deltaY != null) params.deltaY = deltaY;
  if (atX != null && atY != null) {
    params.x = atX;
    params.y = atY;
  }
  return interactAndReturn(params, flags);
}

export async function handleScrollTo(args: string[]) {
  const { positionals, flags } = parseFlags(args);
  const params: AppInteractionParams = { action: 'scroll-to' };
  const optionsError = applyCommonOptions(params, flags);
  if (optionsError) return optionsError;
  if (!applyElementTarget(params, flags, positionals[0])) {
    return fail('Usage: sero app scroll-to --selector <sel> OR --text "text" OR --ref <ref> [--within <sel>]');
  }
  return interactAndReturn(params, flags);
}

export async function handleSelect(args: string[]) {
  const { positionals, flags } = parseFlags(args);
  const params: AppInteractionParams = { action: 'select' };
  const optionsError = applyCommonOptions(params, flags);
  if (optionsError) return optionsError;
  if (!applyElementTarget(params, flags, positionals[0])) return fail('Usage: sero app select <selector|--ref ref>');
  return interactAndReturn(params, flags);
}

export async function handleHover(args: string[]) {
  const { positionals, flags } = parseFlags(args);
  const params: AppInteractionParams = { action: 'hover' };
  const optionsError = applyCommonOptions(params, flags);
  if (optionsError) return optionsError;
  if (!applyElementTarget(params, flags, positionals[0])) return fail('Usage: sero app hover <selector|--ref ref>');
  return interactAndReturn(params, flags);
}

export async function handleInspect(args: string[]) {
  const { positionals, flags } = parseFlags(args);
  const selector = positionals[0] ?? requireFlagString(flags, 'selector') ?? undefined;
  const pointResult = parseCoordinateFlags(flags, 'Usage: sero app inspect [<selector>] [--x <n> --y <n>]');
  if (pointResult && isCliResult(pointResult)) return pointResult;
  const point = pointResult ?? null;
  const ref = requireFlagString(flags, 'ref') ?? undefined;
  if ([Boolean(selector), Boolean(ref), Boolean(point)].filter(Boolean).length > 1) {
    return fail('Use only one inspect target: selector, --ref, or --x/--y coordinates.');
  }

  const params: AppInteractionParams = { action: 'inspect', captureAfter: false };
  const optionsError = applyCommonOptions(params, flags);
  if (optionsError) return optionsError;
  if (selector) params.selector = selector;
  else if (ref) params.ref = ref;
  else if (point) {
    params.x = point.x;
    params.y = point.y;
  }
  return interactAndReturn(params, flags);
}

export async function handleGetText(args: string[]) {
  const { positionals, flags } = parseFlags(args);
  const selector = requireFlagString(flags, 'selector') ?? positionals[0] ?? undefined;
  const params: AppInteractionParams = {
    action: 'get-text',
    captureAfter: false,
    selector,
    ref: requireFlagString(flags, 'ref') ?? undefined,
    visibleOnly: flags.has('visible-only'),
    aroundText: requireFlagString(flags, 'around') ?? undefined,
  };
  const optionsError = applyCommonOptions(params, flags);
  if (optionsError) return optionsError;
  if (positionals[0] && !params.selector) params.selector = positionals[0];
  const openError = await openAppFromFlags(flags);
  if (openError) return openError;
  const result = await appControlHostService.interact(params);
  if (!result.success) return fail(result.message);
  return ok(result.textContent ?? '(empty)');
}

export async function handleVisible(args: string[]) {
  const { positionals, flags } = parseFlags(args);
  const params: AppInteractionParams = { action: 'visible', captureAfter: false };
  const optionsError = applyCommonOptions(params, flags);
  if (optionsError) return optionsError;
  if (!applyElementTarget(params, flags, positionals[0])) {
    return fail('Usage: sero app visible --text "text" OR --selector <sel> OR --ref <ref>');
  }
  return interactAndReturn(params, flags);
}

export async function handleSnapshot(args: string[] = []) {
  const { flags } = parseFlags(args);
  return interactAndReturn({ action: 'snapshot', captureAfter: false }, flags);
}

export async function handleScrollContainers(args: string[] = []) {
  const { flags } = parseFlags(args);
  const params: AppInteractionParams = { action: 'scroll-containers', captureAfter: false };
  const optionsError = applyCommonOptions(params, flags);
  if (optionsError) return optionsError;
  return interactAndReturn(params, flags);
}

export async function handleScreenshotAround(args: string[], ctx: CliCommandContext) {
  const { positionals, flags } = parseFlags(args);
  const params: AppInteractionParams = { action: 'scroll-to', captureAfter: false };
  const optionsError = applyCommonOptions(params, flags);
  if (optionsError) return optionsError;
  if (!applyElementTarget(params, flags, positionals[0])) {
    return fail('Usage: sero app screenshot-around --text "text" [--within <sel>] [--save <path>]');
  }

  const openError = await openAppFromFlags(flags);
  if (openError) return openError;
  const scrollResult = await appControlHostService.interact(params);
  if (!scrollResult.success) return fail(scrollResult.message);

  const capture = await appControlHostService.captureVisibleApp();
  if (!capture) return fail('Screenshot failed — app panel not found or not visible.');
  const savePath = requireFlagString(flags, 'save');
  const description = `Screenshot around ${params.text ?? params.selector ?? params.ref}: ${scrollResult.message}\n${buildScreenshotDescription('active', capture.rect)}`;
  if (savePath) {
    const absPath = await saveScreenshot(capture.base64, savePath, ctx);
    return okWithImage(`${description}\nSaved PNG: ${absPath}`, capture.base64);
  }
  return okWithImage(description, capture.base64);
}
