import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { assistantTmpDir, confinedSettings, confinementFor } from '../confinement.js';
import { agentConfigDir, seedAgentConfig } from '../agent-pty.js';

// The assistant runs with permission prompts off, so these folders are what keeps it out of the interviewer's machine and out of
// what the candidate must not see. The test builds the real layout and checks what is closed and what is open.
let root = '';
let home = '';
const layout = () => {
  const work = join(root, '.solutions', 'maya', 'fibonacci');
  mkdirSync(work, { recursive: true });
  mkdirSync(join(root, '.solutions', 'maya', '.hidden', 'fibonacci'), { recursive: true });
  mkdirSync(join(root, '.solutions', 'omar', 'fibonacci'), { recursive: true });
  return { work, config: agentConfigDir(work) };
};

beforeEach(() => { root = realpathSync(mkdtempSync(join(tmpdir(), 'trio-jail-'))); home = join(root, 'home'); mkdirSync(home, { recursive: true }); });
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('what a terminal assistant may read', () => {
  test('the interviewer\'s home, the tool\'s own folder and every other candidate are closed', () => {
    const { work, config } = layout();
    const { denyRead } = confinementFor({ workPath: work, configDir: config, projectRoot: root, home });
    for (const closed of [home, root, join(root, '.solutions')]) expect(denyRead, closed).toContain(closed);
  });

  test('the temporary folders are closed too, because they hold the interviewer\'s other sessions of the same tool', () => {
    const { work, config } = layout();
    const { denyRead } = confinementFor({ workPath: work, configDir: config, projectRoot: root, home });
    for (const closed of ['/tmp', '/private/tmp', '/var/folders', '/private/var/folders']) expect(denyRead, closed).toContain(closed);
  });

  test('the assistant works in a temporary folder of its own, never the interviewer\'s', () => {
    const { work, config } = layout();
    expect(assistantTmpDir(config)).toBe(join(config, 'tmp'));
    const { allowRead } = confinementFor({ workPath: work, configDir: config, projectRoot: root, home });
    expect(allowRead).toContain(config);
    for (const shared of ['/tmp', '/private/tmp']) expect(allowRead.some(a => a === shared || a.startsWith(shared + '/claude-'))).toBe(false);
  });

  test('the phases the interviewer has not released stay closed even though they sit next to the candidate\'s folder', () => {
    const { work, config } = layout();
    const { denyRead, allowRead } = confinementFor({ workPath: work, configDir: config, projectRoot: root, home });
    expect(denyRead).toContain(join(root, '.solutions', 'maya', '.hidden'));
    // nothing that would reopen the folder that holds them
    expect(allowRead).not.toContain(join(root, '.solutions', 'maya'));
    expect(allowRead).not.toContain(join(root, '.solutions'));
  });

  test('only the candidate\'s own folder and the assistant\'s own configuration are opened again', () => {
    const { work, config } = layout();
    const { allowRead } = confinementFor({ workPath: work, configDir: config, projectRoot: root, home });
    expect(allowRead).toContain(work);
    expect(allowRead).toContain(config);
    expect(allowRead).not.toContain(join(root, '.solutions', 'omar', 'fibonacci'));
    expect(allowRead).not.toContain(join(home, '.ssh'));
  });

  test('the assistant\'s settings turn on both layers and cannot be edited by the assistant', () => {
    const { work, config } = layout();
    const settings = confinedSettings({ workPath: work, configDir: config, projectRoot: root, home }) as any;
    expect(settings.permissions.blockReadsOutsideWorkingDirectories).toBe(true);
    expect(settings.permissions.blockWritesOutsideWorkingDirectories).toBe(true);
    expect(settings.sandbox.enabled).toBe(true);
    // a command the sandbox stops is not run again outside it
    expect(settings.sandbox.allowUnsandboxedCommands).toBe(false);
    // it may write in its own folder and nowhere else
    expect(settings.sandbox.filesystem.allowWrite).toContain(work);
    expect(settings.sandbox.filesystem.allowWrite).not.toContain(root);
  });

  test('seeding the private configuration writes those settings, every time, over an older one', () => {
    const { work, config } = layout();
    mkdirSync(config, { recursive: true });
    writeFileSync(join(config, 'settings.json'), JSON.stringify({ permissions: { defaultMode: 'bypassPermissions' } }));
    seedAgentConfig(config, work);
    const written = JSON.parse(readFileSync(join(config, 'settings.json'), 'utf-8'));
    expect(written.sandbox.enabled).toBe(true);
    expect(written.permissions.blockReadsOutsideWorkingDirectories).toBe(true);
    expect(written.skipDangerousModePermissionPrompt).toBe(true);
  });
});
