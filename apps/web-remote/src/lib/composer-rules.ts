/**
 * When the composer may send.
 *
 * An image with no caption is a message: the submit handler already
 * accepts one, and a phone user often has nothing to add to a photo.
 * So an attachment counts as content the same way text does.
 */
export function canSend(input: {
  text: string;
  attachmentCount: number;
  disabled: boolean;
  isStreaming: boolean;
}): boolean {
  if (input.disabled || input.isStreaming) return false;
  return input.text.trim().length > 0 || input.attachmentCount > 0;
}
