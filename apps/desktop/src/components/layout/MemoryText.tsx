/** Memory text with `code` spans drawn as inline code, as the chat does in replies. */
export function MemoryText({ text }: { text: string }) {
  const parts = text.split(/`([^`\n]+)`/);
  return (
    <>
      {parts.map((part, index) => (index % 2 === 1
        ? (
          <code key={`${index}:${part}`} className="rounded bg-[var(--bg-elevated)] px-1 font-mono text-[var(--text-secondary)]">{part}</code>
        )
        : part))}
    </>
  );
}
