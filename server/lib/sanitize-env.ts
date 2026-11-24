export function sanitizeEnvironment(exercisePath: string): Record<string, string | undefined> {
  // Pass through variables Claude CLI needs to authenticate and run correctly.
  // HOME must point to real home so Claude can read ~/.claude.json (auth credentials).
  // cwd is set separately to exercise path to scope file operations.
  const allowedKeys = [
    'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'TZ',
    'NODE_ENV', 'NODE_PATH',
    // Claude auth - needed so CLI can authenticate
    'ANTHROPIC_API_KEY', 'CLAUDE_API_KEY',
    // macOS/Linux session info
    'TMPDIR', 'TEMP', 'TMP',
    'XDG_CONFIG_HOME', 'XDG_CACHE_HOME',
    // Terminal info (Claude may need it)
    'TERM', 'COLORTERM',
  ];

  const sanitized: Record<string, string | undefined> = {};

  for (const key of allowedKeys) {
    if (process.env[key]) {
      sanitized[key] = process.env[key];
    }
  }

  // Set working directory context (real HOME is kept for auth)
  sanitized.PWD = exercisePath;

  // Strip cloud-provider credentials, no reason Claude needs these
  delete sanitized.AWS_ACCESS_KEY_ID;
  delete sanitized.AWS_SECRET_ACCESS_KEY;
  delete sanitized.AWS_SESSION_TOKEN;

  return sanitized;
}
