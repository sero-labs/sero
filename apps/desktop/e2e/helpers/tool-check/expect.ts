import type { ToolCallResult } from './types';

/** `sero-cli` starts the text of a failed command with this. */
const CLI_FAILURE = /^ERROR: /;

function failed(result: ToolCallResult): boolean {
  return result.isError ?? CLI_FAILURE.test(result.text);
}

/** Fails unless the call succeeded. */
export function expectOk(result: ToolCallResult): void {
  if (failed(result)) throw new Error(`expected success, got an error: ${result.text}`);
}

/** Fails unless the call failed and its text contains `fragment`. */
export function expectError(result: ToolCallResult, fragment: string): void {
  if (!failed(result)) throw new Error(`expected an error, got success: ${result.text}`);
  if (!result.text.includes(fragment)) throw new Error(`error does not mention ${JSON.stringify(fragment)}: ${result.text}`);
}

/** Fails unless the call succeeded and its text contains `fragment`. */
export function expectText(result: ToolCallResult, fragment: string): void {
  expectOk(result);
  if (!result.text.includes(fragment)) throw new Error(`result does not mention ${JSON.stringify(fragment)}: ${result.text}`);
}

/** Magic bytes by type. A session may re-encode a tool's PNG as JPEG on its way to the model. */
const SIGNATURES: Record<string, Buffer> = {
  'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
};

/** Fails unless the call succeeded with a real PNG or JPEG image larger than a blank capture. */
export function expectImage(result: ToolCallResult, minBytes = 1_000): void {
  expectOk(result);
  const image = result.images[0];
  if (!image) throw new Error(`no image came back: ${result.text}`);
  const bytes = Buffer.from(image.data, 'base64');
  const signature = SIGNATURES[image.mimeType];
  if (!signature || !bytes.subarray(0, signature.length).equals(signature)) {
    throw new Error(`the image is not a PNG or JPEG (${image.mimeType}, ${bytes.length} bytes)`);
  }
  if (bytes.length < minBytes) throw new Error(`the image is only ${bytes.length} bytes`);
}
