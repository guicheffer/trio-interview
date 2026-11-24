// The landing page shows code without loading the editor, using scripts/tokenize-js.py. This compares it with what the
// real Monaco editor of the app produced for the same code (saved in fixtures/), so a change to either shows up here.
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, test } from 'vitest';

const root = join(__dirname, '..', '..');
const fixture = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'monaco-fibonacci.json'), 'utf-8')) as Record<string, string | string[]>;

/** [class, text] pairs, with neighbours of the same class joined: Monaco splits a long comment in two spans, which looks the same */
function canon(html: string): [string, string][] {
  const out: [string, string][] = [];
  for (const m of html.replace(/ /g, ' ').matchAll(/<span class="(mtk\d+)">([^<]*)<\/span>/g)) {
    const last = out[out.length - 1];
    if (last && last[0] === m[1]) last[1] += m[2]; else out.push([m[1], m[2]]);
  }
  return out;
}

function mine(source: string): string[] {
  const run = spawnSync('python3', ['-c', 'import json,sys,importlib.util as u;s=u.spec_from_file_location("t","scripts/tokenize-js.py");m=u.module_from_spec(s);s.loader.exec_module(m);print(json.dumps(m.code_html(sys.stdin.read())))'], { cwd: root, input: source, encoding: 'utf-8' });
  expect(run.status, run.stderr).toBe(0);
  return JSON.parse(run.stdout);
}

describe('the landing page colours code the way the editor does', () => {
  for (const key of ['before', 'after'] as const) {
    test(`the ${key} version of the exercise file matches Monaco line by line`, () => {
      const ours = mine(fixture[key] as string);
      const real = fixture[`${key}Monaco`] as string[];
      for (let i = 0; i < ours.length; i++) expect(canon(ours[i]), `line ${i + 1}`).toEqual(canon(real[i]));
    });
  }
});
