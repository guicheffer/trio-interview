import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { FastifyInstance } from 'fastify';
import { LOCAL, TUNNEL, buildApp, makeWorkspace, type Workspace } from './harness.js';

const enc = encodeURIComponent;

describe('file routes', () => {
  let ws: Workspace;
  let app: FastifyInstance;
  let work: string;

  beforeAll(async () => {
    ws = makeWorkspace();
    const { activateCandidate } = await import('../../lib/active-candidate.js');
    const { applyVisibility } = await import('../../lib/visibility.js');
    work = activateCandidate('maria', ws.exercise, 'demo');
    applyVisibility(ws.exercise, 'maria', 'demo');
    const { registerFileRoutes } = await import('../files.js');
    app = await buildApp(registerFileRoutes);
  });

  afterAll(async () => {
    await app.close();
    ws.restore();
  });

  test('lists the files for a candidate without the hidden ones', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/files', headers: TUNNEL });
    const paths = res.json().files.map((f: { path: string }) => f.path);

    expect(paths).toContain('src/index.ts');
    expect(paths).toContain('phases/phase-1.md');
    expect(paths).not.toContain('phases/phase-2-hidden.md');
  });

  test('lists the hidden files, marked, for the interviewer', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/files', headers: LOCAL });
    const hidden = res.json().files.find((f: { path: string }) => f.path === 'phases/phase-2-hidden.md');

    expect(hidden).toMatchObject({ hidden: true, type: 'file' });
  });

  test('reads a file, and a hidden one only for the interviewer', async () => {
    const own = await app.inject({ method: 'GET', url: `/api/files/${enc('src/index.ts')}`, headers: TUNNEL });
    expect(own.json().content).toBe('export const n = 1;');

    const asInterviewer = await app.inject({ method: 'GET', url: `/api/files/${enc('phases/phase-2-hidden.md')}`, headers: LOCAL });
    expect(asInterviewer.json()).toEqual({ content: 'two', hidden: true });

    const asCandidate = await app.inject({ method: 'GET', url: `/api/files/${enc('phases/phase-2-hidden.md')}`, headers: TUNNEL });
    expect(asCandidate.statusCode).toBe(500);
  });

  test('creates and saves a file', async () => {
    const created = await app.inject({ method: 'POST', url: '/api/files', headers: TUNNEL, payload: { path: 'notes/todo.md', content: 'a' } });
    expect(created.statusCode).toBe(201);

    const saved = await app.inject({ method: 'PUT', url: `/api/files/${enc('notes/todo.md')}`, headers: TUNNEL, payload: { content: 'b' } });
    expect(saved.json()).toEqual({ ok: true });
    expect(readFileSync(join(work, 'notes', 'todo.md'), 'utf-8')).toBe('b');
  });

  test('validates the request bodies', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/files', headers: TUNNEL, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PUT', url: `/api/files/${enc('a.md')}`, headers: TUNNEL, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'PATCH', url: `/api/files/${enc('a.md')}`, headers: TUNNEL, payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/api/files-move', headers: TUNNEL, payload: { from: 'a' } })).statusCode).toBe(400);
  });

  test('refuses paths outside the candidate folder', async () => {
    const create = await app.inject({ method: 'POST', url: '/api/files', headers: TUNNEL, payload: { path: '../outside.txt', content: 'x' } });
    expect(create.statusCode).toBe(403);
    expect(existsSync(join(ws.root, '.solutions', 'maria', 'outside.txt'))).toBe(false);

    const save = await app.inject({ method: 'PUT', url: `/api/files/${enc('../../outside.txt')}`, headers: TUNNEL, payload: { content: 'x' } });
    expect(save.statusCode).toBe(403);

    const move = await app.inject({ method: 'POST', url: '/api/files-move', headers: TUNNEL, payload: { from: 'src/index.ts', toDir: '../..' } });
    expect(move.statusCode).toBe(403);
  });

  test('locked files are read only for candidates and editable for the interviewer', async () => {
    const edit = await app.inject({ method: 'PUT', url: `/api/files/${enc('description.md')}`, headers: TUNNEL, payload: { content: 'hacked' } });
    expect(edit.statusCode).toBe(403);

    const folder = await app.inject({ method: 'POST', url: '/api/files', headers: TUNNEL, payload: { path: 'phases/new.md', content: '' } });
    expect(folder.statusCode).toBe(403);

    const rename = await app.inject({ method: 'PATCH', url: `/api/files/${enc('description.md')}`, headers: TUNNEL, payload: { newName: 'x.md' } });
    expect(rename.statusCode).toBe(403);

    const renameOut = await app.inject({ method: 'PATCH', url: `/api/files/${enc('src/index.ts')}`, headers: TUNNEL, payload: { newName: 'description.md' } });
    expect(renameOut.statusCode).toBe(403);

    const dotted = await app.inject({ method: 'PUT', url: `/api/files/${enc('./description.md')}`, headers: TUNNEL, payload: { content: 'hacked' } });
    expect(dotted.statusCode).toBe(403);

    const moveOut = await app.inject({ method: 'POST', url: '/api/files-move', headers: TUNNEL, payload: { from: 'phases/phase-1.md', toDir: 'src' } });
    expect(moveOut.statusCode).toBe(403);

    const interviewer = await app.inject({ method: 'PUT', url: `/api/files/${enc('description.md')}`, headers: LOCAL, payload: { content: '# Edited' } });
    expect(interviewer.statusCode).toBe(200);
    expect(readFileSync(join(work, 'description.md'), 'utf-8')).toBe('# Edited');
  });

  test('the interviewer edits a hidden file in place', async () => {
    const res = await app.inject({ method: 'PUT', url: `/api/files/${enc('phases/phase-2-hidden.md')}`, headers: LOCAL, payload: { content: 'changed' } });
    expect(res.json()).toEqual({ ok: true, hidden: true });
    expect(existsSync(join(work, 'phases', 'phase-2-hidden.md'))).toBe(false);
  });

  test('renames and moves files', async () => {
    const renamed = await app.inject({ method: 'PATCH', url: `/api/files/${enc('notes/todo.md')}`, headers: TUNNEL, payload: { newName: 'done.md' } });
    expect(renamed.json()).toEqual({ ok: true, newName: 'done.md' });

    const bad = await app.inject({ method: 'PATCH', url: `/api/files/${enc('notes/done.md')}`, headers: TUNNEL, payload: { newName: '../x.md' } });
    expect(bad.statusCode).toBe(403);

    const moved = await app.inject({ method: 'POST', url: '/api/files-move', headers: TUNNEL, payload: { from: 'notes/done.md', toDir: 'archive' } });
    expect(moved.json()).toEqual({ ok: true, path: 'archive/done.md' });
    expect(existsSync(join(work, 'archive', 'done.md'))).toBe(true);

    const toRoot = await app.inject({ method: 'POST', url: '/api/files-move', headers: TUNNEL, payload: { from: 'archive/done.md', toDir: '' } });
    expect(toRoot.json().path).toBe('done.md');
  });

  test('refuses to move a folder into itself', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/files-move', headers: TUNNEL, payload: { from: 'notes', toDir: 'notes' } });
    expect(res.statusCode).toBe(400);
  });

  test('deletes a file or a folder, and refuses what is locked for a candidate', async () => {
    await app.inject({ method: 'POST', url: '/api/files', headers: TUNNEL, payload: { path: 'trash/a.txt', content: 'a' } });
    await app.inject({ method: 'POST', url: '/api/files', headers: TUNNEL, payload: { path: 'trash/deep/b.txt', content: 'b' } });

    const file = await app.inject({ method: 'DELETE', url: `/api/files/${enc('trash/a.txt')}`, headers: TUNNEL });
    expect(file.json()).toEqual({ ok: true });
    expect(existsSync(join(work, 'trash', 'a.txt'))).toBe(false);

    const folder = await app.inject({ method: 'DELETE', url: `/api/files/${enc('trash')}`, headers: TUNNEL });
    expect(folder.statusCode).toBe(200);
    expect(existsSync(join(work, 'trash'))).toBe(false);

    expect((await app.inject({ method: 'DELETE', url: `/api/files/${enc('trash/none.txt')}`, headers: TUNNEL })).statusCode).toBe(404);
  });

  test('a candidate cannot delete a locked file, a locked folder or a folder that holds one', async () => {
    const locked = await app.inject({ method: 'DELETE', url: `/api/files/${enc('description.md')}`, headers: TUNNEL });
    expect(locked.statusCode).toBe(403);
    expect(existsSync(join(work, 'description.md'))).toBe(true);

    expect((await app.inject({ method: 'DELETE', url: `/api/files/${enc('phases')}`, headers: TUNNEL })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/api/files/${enc('phases/phase-1.md')}`, headers: TUNNEL })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/api/files/${enc('./Phases/phase-1.md')}`, headers: TUNNEL })).statusCode).toBe(403);
    expect(existsSync(join(work, 'phases', 'phase-1.md'))).toBe(true);
  });

  test('delete stays inside the candidate folder', async () => {
    expect((await app.inject({ method: 'DELETE', url: `/api/files/${enc('../../x')}`, headers: TUNNEL })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/api/files/${enc('.')}`, headers: LOCAL })).statusCode).toBeGreaterThanOrEqual(400);
    expect(existsSync(join(work, 'description.md'))).toBe(true);
  });

  test('the interviewer may delete a locked file but not one still hidden from the candidate', async () => {
    const hidden = await app.inject({ method: 'DELETE', url: `/api/files/${enc('phases/phase-2-hidden.md')}`, headers: LOCAL });
    expect(hidden.statusCode).toBe(409);

    await app.inject({ method: 'POST', url: '/api/files', headers: LOCAL, payload: { path: 'phases/extra.md', content: '' } });
    const locked = await app.inject({ method: 'DELETE', url: `/api/files/${enc('phases/extra.md')}`, headers: LOCAL });
    expect(locked.statusCode).toBe(200);
    expect(existsSync(join(work, 'phases', 'extra.md'))).toBe(false);
  });

  test('a rename or move takes the AI sparkle along, for a file and for a folder', async () => {
    const { markAiFile, readAiFiles } = await import('../../lib/ai-files.js');
    await app.inject({ method: 'POST', url: '/api/files', headers: TUNNEL, payload: { path: 'ai/one.ts', content: '1' } });
    markAiFile(work, 'ai/one.ts');

    await app.inject({ method: 'PATCH', url: `/api/files/${enc('ai/one.ts')}`, headers: TUNNEL, payload: { newName: 'two.ts' } });
    expect(readAiFiles(work)).toContain('ai/two.ts');
    expect(readAiFiles(work)).not.toContain('ai/one.ts');

    await app.inject({ method: 'PATCH', url: `/api/files/${enc('ai')}`, headers: TUNNEL, payload: { newName: 'bots' } });
    expect(readAiFiles(work)).toContain('bots/two.ts');

    await app.inject({ method: 'POST', url: '/api/files-move', headers: TUNNEL, payload: { from: 'bots', toDir: 'src' } });
    expect(readAiFiles(work)).toContain('src/bots/two.ts');
  });

  test('serves the run command and the challenge meta', async () => {
    const run = await app.inject({ method: 'GET', url: '/api/run-challenge' });
    expect(run.json()).toMatchObject({ start: 'npm start' });

    const meta = await app.inject({ method: 'GET', url: '/api/challenge-meta' });
    expect(meta.json()).toMatchObject({ exerciseId: 'demo', defaultFile: 'description.md', lockedFiles: ['description.md', 'phases/'] });
  });

  test('serves the tests block of the exercise, or null when it has none', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/tests-config' })).json()).toEqual({ tests: null });
    const file = join(ws.exercise, 'exercise.json');
    const before = readFileSync(file, 'utf-8');
    try {
      writeFileSync(file, JSON.stringify({ tests: { command: 'node --test', files: ['a.test.js'], cases: ['one'] } }));
      expect((await app.inject({ method: 'GET', url: '/api/tests-config', headers: TUNNEL })).json()).toEqual({ tests: { command: 'node --test', files: ['a.test.js'], description: null, cases: ['one'] } });
    } finally { writeFileSync(file, before); }
  });

  test('a candidate cannot read the exercise config', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/files/${enc('exercise.json')}`, headers: TUNNEL });
    expect(res.statusCode).not.toBe(200);
  });
});

describe('file routes without a session', () => {
  test('refuse to serve the exercise template', async () => {
    const ws = makeWorkspace();
    const { registerFileRoutes } = await import('../files.js');
    const app = await buildApp(registerFileRoutes);
    const { clearActiveSession } = await import('../../lib/active-candidate.js');
    clearActiveSession();
    const res = await app.inject({ method: 'GET', url: '/api/files', headers: TUNNEL });
    expect(res.statusCode).toBe(409);
    expect((await app.inject({ method: 'GET', url: '/api/run-challenge', headers: TUNNEL })).statusCode).toBe(200);
    await app.close();
    ws.restore();
  });
});
