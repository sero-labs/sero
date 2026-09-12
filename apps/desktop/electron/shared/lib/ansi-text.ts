/**
 * Strip ANSI escape sequences from text headed for a person or a model.
 *
 * Capture files keep the exact bytes; this is for the presentation copy only.
 * No Sero surface renders ANSI as styling — not the tool card, not the capture
 * viewer — so an escape sequence is pure noise, and in observed payloads it
 * accounted for up to a third of the bytes. Stripping here also covers tools
 * that ignore `NO_COLOR` or force colour regardless of it.
 *
 * This pattern matches the plugin's copy in
 * `plugins/sero-output-optimizer-plugin/extension/compaction/ansi.ts`. The two
 * cannot share a module: the plugin loads from its own package.
 */
const ANSI_PATTERN =
  /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}
