import { describe, expect, test } from 'vitest';
import { describeTool, versionAtLeast, type ToolFacts } from '../assistant-status.js';

const fine: ToolFacts = { name: 'Pi', installed: true, version: '0.73.1', installHint: 'npm install -g pi', login: 'anthropic, from your own Pi setup', sandboxProblem: null };

describe('what is said about an assistant', () => {
  test('ready says the version, the login and the sandbox in one line', () => {
    const report = describeTool(fine);
    expect(report.ok).toBe(true);
    expect(report.line).toBe('Pi: ready (installed 0.73.1; login: anthropic, from your own Pi setup; sandbox: ok)');
  });

  test('each missing piece is named, and the first one that stops it is the reason', () => {
    expect(describeTool({ ...fine, installed: false, version: '' }).message).toContain('npm install -g pi');
    expect(describeTool({ ...fine, versionProblem: 'Pi 0.73 or later is needed' }).message).toBe('Pi 0.73 or later is needed');
    expect(describeTool({ ...fine, login: null, loginProblem: 'Sign in once: run pi, then /login.' }).message).toBe('Sign in once: run pi, then /login.');
    expect(describeTool({ ...fine, sandboxProblem: 'sandbox-exec was not found' }).message).toBe('sandbox-exec was not found');
    for (const broken of [{ installed: false }, { sandboxProblem: 'no sandbox' }]) {
      const report = describeTool({ ...fine, ...broken });
      expect(report.ok).toBe(false);
      expect(report.line).toContain('NOT ready');
      expect(report.needsSignIn).toBe(false);
    }
  });

  test('only a missing sign in is said softly, in one short line, and it is not an error', () => {
    const report = describeTool({ ...fine, login: null, loginProblem: 'Sign in once: run pi, then /login.' });
    expect(report.ok).toBe(false);
    expect(report.needsSignIn).toBe(true);
    expect(report.line).toBe('Pi: Sign in once: run pi, then /login. (installed 0.73.1)');
    expect(report.line).not.toMatch(/NOT ready|login: none/);
  });

  test('a missing sign in on a program that cannot start anyway is not called a sign in problem', () => {
    expect(describeTool({ ...fine, login: null, sandboxProblem: 'no sandbox' }).needsSignIn).toBe(false);
    expect(describeTool({ ...fine, login: null, installed: false }).needsSignIn).toBe(false);
  });

  test('versions compare by major and minor', () => {
    expect(versionAtLeast('0.73.1', 0, 73)).toBe(true);
    expect(versionAtLeast('0.72.9', 0, 73)).toBe(false);
    expect(versionAtLeast('1.0.0', 0, 73)).toBe(true);
    expect(versionAtLeast('pi', 0, 73)).toBe(false);
  });
});
