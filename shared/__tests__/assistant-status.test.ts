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
    expect(describeTool({ ...fine, login: null, loginProblem: 'Pi has no saved login' }).message).toBe('Pi has no saved login');
    expect(describeTool({ ...fine, sandboxProblem: 'sandbox-exec was not found' }).message).toBe('sandbox-exec was not found');
    for (const broken of [{ installed: false }, { login: null }, { sandboxProblem: 'no sandbox' }]) {
      const report = describeTool({ ...fine, ...broken });
      expect(report.ok).toBe(false);
      expect(report.line).toContain('NOT ready');
    }
  });

  test('a program that is installed but has no login is not reported as ready', () => {
    const report = describeTool({ ...fine, login: null });
    expect(report.line).toContain('login: none found');
    expect(report.line).not.toContain(': ready');
  });

  test('versions compare by major and minor', () => {
    expect(versionAtLeast('0.73.1', 0, 73)).toBe(true);
    expect(versionAtLeast('0.72.9', 0, 73)).toBe(false);
    expect(versionAtLeast('1.0.0', 0, 73)).toBe(true);
    expect(versionAtLeast('pi', 0, 73)).toBe(false);
  });
});
