import { afterEach, describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { agentConfigDir, claudeArgs, routerEnvironment, seedAgentConfig } from '../agent-pty.js';
import { buildTerminalSystemPrompt } from '../assistant-prompt.js';
import { isAgentMode, readAgentMode, writeAgentMode } from '../agent-mode.js';

const dirs: string[] = [];
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'agent-')); dirs.push(d); return d; };
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe('Claude Code terminal', () => {
  test('starts with the same limits as the chat and keeps the interviewer\'s config out', () => {
    const args = claudeArgs('ctx', false);
    expect(args).toContain('--strict-mcp-config');
    expect(args).toContain('--no-chrome');
    expect(args.join(' ')).toContain('--setting-sources user');
    expect(args).not.toContain('--continue');
    expect(args[args.indexOf('--model') + 1]).toBe('claude-sonnet-5-5');
    const blocked = args.slice(args.indexOf('--disallowedTools') + 1, args.indexOf('--append-system-prompt'));
    expect(blocked).toContain('PushNotification');
    expect(blocked).not.toContain('AskUserQuestion');
    expect(claudeArgs('ctx', true)).toContain('--continue');
  });

  test('seeds a private config with no status line, hooks or plugins, and trusts the folder', () => {
    const work = tmp();
    const config = agentConfigDir(work);
    seedAgentConfig(config, work);
    const settings = JSON.parse(readFileSync(join(config, 'settings.json'), 'utf-8'));
    for (const key of ['statusLine', 'hooks', 'enabledPlugins']) expect(settings[key]).toBeUndefined();
    const state = JSON.parse(readFileSync(join(config, '.claude.json'), 'utf-8'));
    expect(state.projects[work].hasTrustDialogAccepted).toBe(true);
    expect(settings.disableAutoMode).toBe('disable');
  });

  test('only the router variables come from the interviewer\'s setup', () => {
    process.env.ANTHROPIC_BASE_URL = 'https://router.example';
    const env = routerEnvironment();
    expect(env.ANTHROPIC_BASE_URL).toBe('https://router.example');
    expect(Object.keys(env).every(k => k.startsWith('ANTHROPIC_') || k.startsWith('CLAUDE_CODE_'))).toBe(true);
    delete process.env.ANTHROPIC_BASE_URL;
  });

  test('the prompt keeps the exercise rules but drops the chat-only question block', () => {
    const prompt = buildTerminalSystemPrompt('A React app.');
    expect(prompt).toMatch(/exercise folder/i);
    expect(prompt).not.toContain('trio-question');
    expect(prompt).toContain('A React app.');
  });

  test('the chosen mode is remembered per exercise and only known modes are accepted', () => {
    const work = join(tmp(), 'fibonacci');
    expect(readAgentMode(work)).toBeNull();
    writeAgentMode(work, 'claude-code');
    expect(readAgentMode(work)).toBe('claude-code');
    expect(isAgentMode('codex')).toBe(false);
    expect(existsSync(join(work, '..', 'agent-mode-fibonacci.json'))).toBe(true);
  });
});

describe('OpenCode version check', () => {
  test('reads the first version number, so v2.3.0 passes and 1.2.3 does not', async () => {
    const { majorVersion } = await import('../agent-mode.js');
    expect(majorVersion('opencode v2.3.0')).toBe(2);
    expect(majorVersion('2.0.1')).toBe(2);
    expect(majorVersion('1.19.5')).toBe(1);
    expect(majorVersion('opencode 1.2.3')).toBe(1);
    expect(majorVersion('v12.4')).toBe(12);
    expect(majorVersion('no number')).toBe(0);
  });
});
