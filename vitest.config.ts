import { defineConfig } from 'vitest/config';

// Files that need a real process, terminal, socket or AI gateway are left out of coverage.
// Their behavior is checked by running the tool (see the server spec), not by unit tests.
const integrationOnly = [
  '*.config.ts',
  '*.config.mjs',
  'next-env.d.ts',
  'app/**',
  'scripts/**',
  'cli/**',
  'server/index.ts',
  'server/lib/claude-proxy.ts',
  'server/lib/terminal-session.ts',
  'server/lib/file-watcher.ts',
  'server/lib/ai-healthcheck.ts',
  'server/lib/session-manager.ts',
  'server/lib/error-handler.ts',
  'server/routes/terminal.ts',
  'server/routes/presence.ts',
  'server/routes/stream.ts',
  'server/routes/chat.ts',
  'server/routes/database.ts',
  'server/routes/watcher.ts',
];

export default defineConfig({
  test: {
    include: ['{app,server,shared,scripts,cli}/**/*.test.ts'],
    exclude: ['node_modules/**', 'exercises/**', '.solutions/**', 'dist/**', '.next/**'],
    passWithNoTests: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      include: ['app/**', 'server/**', 'shared/**', 'scripts/**', 'cli/**'],
      exclude: ['**/*.test.ts', '**/__tests__/**', ...integrationOnly],
    },
  },
});
