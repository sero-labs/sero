/** Strip ANSI escape sequences without touching any other character. */
const ANSI_PATTERN = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[-a-zA-Z\d/#&.:=?%@~_]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))/g;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '');
}

/** Progress and spinner lines shared by build and package-manager output. */
export const PROGRESS_LINE = /^\s*(?:Compiling|Checking|Downloading|Downloaded|Fetching|Fetched|Updating|Updated|Building|Generated|Generating|Creating|Linking|Reusing|Resolving|Installing|Preparing|Progress|Done in)\b|^\s*\d+%$|^\s*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⣾⣽⣻⢿⡿⣟⣯⣷]+/;
