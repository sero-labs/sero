export interface WindowsCommandScript {
  program: string;
  args: string[];
}

export function isWindowsCommandScript(program: string): boolean {
  return /\.(?:cmd|bat)$/i.test(program);
}

export function renderWindowsCommandScript(
  program: string,
  args: readonly string[],
  commandProcessor = process.env.ComSpec || 'cmd.exe',
): WindowsCommandScript | null {
  if (!isWindowsCommandScript(program)) return null;
  const command = [program, ...args].map(quoteCmdArg).join(' ');
  return {
    program: commandProcessor,
    args: ['/d', '/s', '/c', `"${command}"`],
  };
}

function quoteCmdArg(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}
