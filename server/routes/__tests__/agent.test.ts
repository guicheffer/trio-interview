import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { writeFileSync, existsSync, rmSync } from 'fs';
import { join } from 'path';
import { LOCAL, TUNNEL, buildApp, makeWorkspace, type Workspace } from './harness.js';

// The tools "work" here so the test is about who may choose and what is allowed, not about this machine
vi.mock('../../lib/agent-mode.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../lib/agent-mode.js')>();
  const ok = { ok: true, message: 'OK', version: 'test', checkedAt: 1 };
  return { ...original, checkClaudeCode: async () => ok, checkOpencode: async () => ok, cachedAvailability: () => ({ 'claude-code': ok, opencode: ok }) };
});

import { registerAgentRoutes } from '../agent.js';
import { activateCandidate } from '../../lib/active-candidate.js';

describe('who chooses the assistant', () => {
  let app: FastifyInstance;
  let ws: Workspace;
  const json = { 'content-type': 'application/json' };

  beforeAll(async () => { app = await buildApp(registerAgentRoutes); });
  afterAll(() => app.close());
  beforeEach(() => {
    ws = makeWorkspace();
    activateCandidate('zed', ws.exercise, 'demo', false);
  });
  afterEach(() => { ws.restore(); });

  const choose = (headers: Record<string, string>, mode: unknown) =>
    app.inject({ method: 'POST', url: '/api/agent-mode', headers: { ...headers, ...json }, payload: { mode } });
  const writeConfig = (text: string) => writeFileSync(join(process.cwd(), 'interview.config.yaml'), text);

  test('the interviewer cannot choose, even by calling the API directly', async () => {
    const res = await choose(LOCAL, 'claude-code');
    expect(res.statusCode).toBe(403);
    expect((await app.inject({ method: 'GET', url: '/api/agent-mode', headers: LOCAL })).json().mode).toBeNull();
  });

  test('the candidate chooses, and both screens then see it', async () => {
    expect((await choose(TUNNEL, 'claude-code')).statusCode).toBe(200);
    for (const headers of [LOCAL, TUNNEL]) {
      expect((await app.inject({ method: 'GET', url: '/api/agent-mode', headers })).json().mode).toBe('claude-code');
    }
  });

  test('the interviewer sees the options but is told they cannot choose', async () => {
    const mine = (await app.inject({ method: 'GET', url: '/api/agent-mode', headers: LOCAL })).json();
    const theirs = (await app.inject({ method: 'GET', url: '/api/agent-mode', headers: TUNNEL })).json();
    expect(mine.canChoose).toBe(false);
    expect(theirs.canChoose).toBe(true);
    expect(mine.tools.map((t: { tool: string }) => t.tool)).toEqual(['claude-code', 'opencode']);
  });

  test('a tool the interviewer did not allow is refused, even when called directly', async () => {
    writeConfig('tools:\n  - agent\n  - claude-code\n');
    expect((await choose(TUNNEL, 'opencode')).statusCode).toBe(403);
    expect((await choose(TUNNEL, 'claude-code')).statusCode).toBe(200);
    const view = (await app.inject({ method: 'GET', url: '/api/agent-mode', headers: TUNNEL })).json();
    expect(view.tools.find((t: { tool: string }) => t.tool === 'opencode').allowed).toBe(false);
  });

  test('turning a tool off in the settings drops a choice already made', async () => {
    expect((await choose(TUNNEL, 'opencode')).statusCode).toBe(200);
    writeConfig('tools:\n  - agent\n');
    expect((await app.inject({ method: 'GET', url: '/api/agent-mode', headers: TUNNEL })).json().mode).toBeNull();
  });

  test('unknown tools are refused and the chat is always allowed', async () => {
    expect((await choose(TUNNEL, 'codex')).statusCode).toBe(400);
    writeConfig('tools:\n  - claude-code\n');
    expect((await choose(TUNNEL, 'agent')).statusCode).toBe(200);
  });

  test('only the interviewer can recheck or restart', async () => {
    for (const url of ['/api/agent-mode/check', '/api/agent-terminal/restart']) {
      expect((await app.inject({ method: 'POST', url, headers: TUNNEL })).statusCode).toBe(403);
      expect((await app.inject({ method: 'POST', url, headers: LOCAL })).statusCode).toBe(200);
    }
  });

  test('the candidate is never told why a tool cannot open', async () => {
    const view = (await app.inject({ method: 'GET', url: '/api/agent-mode', headers: TUNNEL })).json();
    for (const t of view.tools) { expect(t.message).toBe(''); expect(t.version).toBe(''); }
    expect(existsSync(join(process.cwd(), 'interview.config.yaml'))).toBe(false);
    rmSync(join(process.cwd(), 'interview.config.yaml'), { force: true });
  });
});
