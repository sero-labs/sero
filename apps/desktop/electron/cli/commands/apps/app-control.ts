/**
 * CLI commands for agent app control.
 *
 * All commands are under the `sero app` namespace and go through the
 * sero-cli bridge (AD-020) — zero additional tool schema tokens.
 */

import type { CliRegistry } from '@electron/cli/core/registry';
import type { CliCommandContext } from '@electron/cli/core/types';
import { fail } from '@electron/cli/lib/utils';
import { handleActive, handleInfo, handleList, handleOpen, handlePreview } from './app-control-navigation';
import {
  handleClick,
  handleGetText,
  handleHover,
  handleInspect,
  handleScroll,
  handleSelect,
  handleType,
} from './app-control-interactions';
import { handleRecord } from './app-control-recording';
import { handleScreenshot } from './app-control-screenshot';

async function handleApp(args: string[], ctx: CliCommandContext) {
  const [action, ...rest] = args;
  switch (action) {
    case 'list': return handleList();
    case 'open': return handleOpen(rest);
    case 'active': return handleActive();
    case 'info': return handleInfo(rest);
    case 'screenshot': return handleScreenshot(rest, ctx);
    case 'click': return handleClick(rest);
    case 'type': return handleType(rest);
    case 'scroll': return handleScroll(rest);
    case 'select': return handleSelect(rest);
    case 'hover': return handleHover(rest);
    case 'inspect': return handleInspect(rest);
    case 'get-text': return handleGetText(rest);
    case 'record': return handleRecord(rest, ctx);
    case 'preview': return handlePreview(rest);
    default:
      return fail('Usage: sero app <list|open|active|info|screenshot|click|type|scroll|select|hover|inspect|get-text|record|preview>');
  }
}

export function registerAppControlCliCommands(registry: CliRegistry): void {
  registry.register({
    name: 'app',
    summary: 'Navigate, screenshot, interact with, and record Sero apps',
    group: 'App Control',
    help:
      'app — Sero app control\n\n' +
      'Navigation:\n' +
      '  sero app list                       List all available apps\n' +
      '  sero app open <appId|name>          Switch to an app by id or visible name\n' +
      '  sero app active                     Show the currently active app\n' +
      '  sero app info <appId|name>          Show app details\n\n' +
      'Screenshots:\n' +
      '  sero app screenshot                 Capture the active app (inline image)\n' +
      '  sero app screenshot --app <id|name> Navigate to app then capture\n' +
      '  sero app screenshot --save <path>   Save screenshot to file\n' +
      '  sero app screenshot --app todo --save ./shot.png\n\n' +
      'Interaction:\n' +
      '  sero app click <selector>           Click by CSS selector\n' +
      '  sero app click --x <n> --y <n>      Click at coordinates relative to the app screenshot\n' +
      '  sero app type "<text>" [--selector <sel>]\n' +
      '  sero app scroll --direction <dir> [--amount <px>]\n' +
      '  sero app select <selector>          Focus an element\n' +
      '  sero app hover <selector>           Hover over an element\n' +
      '  sero app inspect [<selector>] [--x <n> --y <n>]\n' +
      '                                     Inspect elements / point hits\n' +
      '  sero app get-text <selector>        Read text content\n\n' +
      'Recording (MP4 video capture):\n' +
      '  sero app record start               Start recording (2 FPS)\n' +
      '  sero app record stop                 Stop and save as MP4 in <workspace>/sero-recordings/\n' +
      '  sero app record stop --save <path>   Stop and copy MP4 to a custom path\n' +
      '  sero app record status               Check recording status\n\n' +
      'Dev Server Preview (in-app):\n' +
      '  sero app preview <url>               Open URL in editor panel\n' +
      '  Renders the dev server inside Sero so it can be captured by\n' +
      '  sero app record and sero app screenshot.\n\n' +
      'App matching accepts visible names as well as ids (for example, Calculator → calc).\n\n' +
      'Click/type/scroll/select/hover auto-capture a screenshot after the action.\n' +
      'Inspect returns JSON and skips the post-action screenshot.',
    execute: handleApp,
  });
}
