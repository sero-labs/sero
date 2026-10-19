import type { ToolProbe } from '../types';
import { expectText } from '../expect';

/**
 * `/google-account` is a plugin slash command that the CLI bridge exposes as `google-account`.
 * The test runs under a temporary HOME with no browser profile, so `getGoogleCookies` finds no cookie
 * file and the handler takes its "Gemini Web is unavailable" branch (index.ts). No Google account is read.
 *
 * The handler's only effect is a chat message sent with `deliverAs: "followUp"`, which the session
 * delivers after the turn that ran the command ends, later than this step's check. The bridge's own
 * result is fixed text (`bridgeCommand` in schema-bridge.ts), so the step proves the command ran
 * to its end without throwing, not what it said.
 */
export const googleAccountProbe: ToolProbe = {
  tool: 'google-account',
  // The command ignores its arguments, so no call to it can fail.
  failingCall: null,
  steps: [{
    action: null,
    params: {},
    expect: (result) => expectText(result, '/google-account executed'),
  }],
};
