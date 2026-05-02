let msgCounter = 0;

export function nextId(): string {
  return `msg-${Date.now()}-${++msgCounter}`;
}
