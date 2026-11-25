/**
 * The programs the scripts run, resolved from PATH.
 * TRIO_<NAME>_BIN points one of them at a specific executable, for example TRIO_CLAUDE_BIN=/opt/bin/claude.
 */
const binary = (name) => process.env[`TRIO_${name.toUpperCase()}_BIN`] || name;

export const BIN = {
  claude: binary('claude'),
  opencode: binary('opencode'),
  pi: binary('pi'),
  npm: binary('npm'),
  which: binary('which'),
  zip: binary('zip'),
};
