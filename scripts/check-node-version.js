#!/usr/bin/env node
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Skip check in CI
if (process.env.CI === 'true') {
  process.exit(0);
}

try {
  const nvmrcPath = join(__dirname, '..', '.nvmrc');
  const expectedVersion = readFileSync(nvmrcPath, 'utf-8').trim();
  const currentVersion = process.version.slice(1); // Remove 'v' prefix

  const expectedMajor = expectedVersion.split('.')[0];
  const currentMajor = currentVersion.split('.')[0];

  if (expectedMajor !== currentMajor) {
    console.error('\nWrong Node version!');
    console.error(`   Expected: v${expectedVersion} (Node ${expectedMajor}.x)`);
    console.error(`   Current:  v${currentVersion}`);
    console.error('\nFix: Run `nvm use` to switch to the correct version\n');
    process.exit(1);
  }

  // Success - silent
  process.exit(0);
} catch (error) {
  console.error('Could not read .nvmrc file:', error.message);
  process.exit(1);
}
