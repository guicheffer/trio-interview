// scripts/build-site.py cuts the app's stylesheet down to what the landing page uses. A selector list cut at a comma that sits
// inside :is( ... ) leaves an open parenthesis, and the browser then drops every rule after it (the page lost its fonts and buttons).
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { describe, expect, test } from 'vitest';

const root = join(__dirname, '..', '..');

function build(css: string, body: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'trio-site-'));
  try {
    const input = join(dir, 'workspace.html');
    writeFileSync(input, `<style>${css}</style></head>${body}`);
    const run = spawnSync('python3', ['scripts/build-site.py', input, join(dir, 'out')], { cwd: root, encoding: 'utf-8' });
    expect(run.status, run.stderr).toBe(0);
    return readFileSync(join(dir, 'out', 'app.css'), 'utf-8');
  } finally { rmSync(dir, { recursive: true, force: true }); }
}

const selectorsOf = (css: string) => [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map(m => m[1].trim());

describe('the stylesheet of the landing page', () => {
  test('a comma inside :is() does not cut the selector in two', () => {
    const css = '.monaco-editor :is(.hc-black, .hc-light) .inputarea{background:red}.keep-me{color:blue}*, ::before, ::after{box-sizing:border-box}';
    const out = build(css, '<div class="keep-me"></div>');
    expect(out).toContain(':is(.hc-black, .hc-light)');
    for (const selector of selectorsOf(out)) {
      expect(selector.split('(').length, selector).toBe(selector.split(')').length);
      expect(selector.split('[').length, selector).toBe(selector.split(']').length);
    }
  });

  test('the rules after an editor rule with commas inside brackets survive', () => {
    const css = '.monaco-editor [data-x="a,b"], .monaco-editor :not(.a, .b){top:0}html, :host{font-family:Geist}.used{color:red}';
    const out = build(css, '<p class="used">x</p>');
    expect(out).toContain('font-family');
    expect(out).toContain('.used');
  });
});
