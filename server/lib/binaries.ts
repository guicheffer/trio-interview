/**
 * The programs the tool runs, resolved from the interviewer's PATH.
 * TRIO_<NAME>_BIN points one of them at a specific executable, for example TRIO_CLAUDE_BIN=/opt/bin/claude.
 */
function binary(name: string): string {
  return process.env[`TRIO_${name.toUpperCase()}_BIN`] || name;
}

export const BIN = {
  claude: binary('claude'),
  opencode: binary('opencode'),
  git: binary('git'),
  cp: binary('cp'),
  tsx: binary('tsx'),
  next: binary('next'),
};
