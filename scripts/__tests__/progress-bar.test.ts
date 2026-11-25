// make start redraws one line with \r. If that line is as wide as the terminal or wider, the terminal wraps it and every redraw
// becomes a new line, which is how the bar ended up repeated down the screen. progress_layout picks a bar and a label that fit.
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, test } from 'vitest';

const source = readFileSync(join(__dirname, '..', 'start-with-tunnel.sh'), 'utf-8');
const functions = source.slice(source.indexOf('# How wide the progress line'), source.indexOf('TIMEOUT_FLAG='));
const LABELS = ['Checking your setup', 'Cleaning up old processes', 'Installing the exercise', 'Starting servers', 'Checking the AI assistant', 'Opening the tunnel', 'Ready'];

function layout(cols: number, label: string) {
  const script = `TOTAL_STEPS=6\n${functions}\nread -r bw shown <<< "$(progress_layout "${label}")"\nprintf "%s|%s|%s" "$bw" "$shown" "$(bar 3 "$bw")"`;
  const run = spawnSync('bash', ['-c', script], { env: { COLUMNS: String(cols), PATH: '/usr/bin:/bin' }, encoding: 'utf-8' });
  expect(run.status, run.stderr).toBe(0);
  const [width, shown, bar] = run.stdout.split('|');
  // 2 spaces, the spinner, 2 spaces, the bar, 2 spaces, "3/6" and 2 spaces, then the label
  return { width: Number(width), shown, visible: 2 + 1 + 2 + [...bar].length + 2 + 3 + 2 + [...shown].length };
}

describe('the progress line of make start', () => {
  test('is always narrower than the terminal, whatever its width', () => {
    for (const cols of [24, 30, 40, 50, 60, 80, 120, 200]) {
      for (const label of LABELS) expect(layout(cols, label).visible, `${cols} columns, "${label}"`).toBeLessThan(cols);
    }
  });

  test('keeps the full bar and the full label when there is room', () => {
    const wide = layout(120, 'Cleaning up old processes');
    expect(wide.width).toBe(24);
    expect(wide.shown).toBe('Cleaning up old processes');
  });

  test('shrinks the bar first and cuts the label only when a small bar does not fit either', () => {
    const narrow = layout(50, 'Cleaning up old processes');
    expect(narrow.width).toBeLessThan(24);
    expect(narrow.width).toBeGreaterThanOrEqual(6);
    expect(layout(30, 'Checking the AI assistant').shown.length).toBeLessThan('Checking the AI assistant'.length);
  });

  test('uses 80 columns when the width cannot be read', () => {
    const script = `${functions}\nterm_cols`;
    const run = spawnSync('/bin/bash', ['-c', script], { env: { COLUMNS: 'wide', PATH: '/nonexistent' }, encoding: 'utf-8' });
    expect(run.stdout.trim()).toBe('80');
  });
});

// The bar is one line redrawn in place with \r and no newline. Anything printed while it runs lands on the end of that line,
// which is how "Some interview settings need a look" ended up glued to the bar. The note is kept and printed after the links.
describe('the settings note of make start', () => {
  const lineOf = (text: string) => source.indexOf(text);

  test('is not printed while the progress bar is on screen', () => {
    const check = source.slice(lineOf('step_config > .logs/config-check.log'), lineOf('export TRIO_PREFLIGHT_DONE=1'));
    expect(check).toContain('CONFIG_NOTE=');
    expect(check).not.toMatch(/\|\|\s*echo/);
  });

  test('is shown after the links, on its own line', () => {
    const printed = lineOf('[ -n "$CONFIG_NOTE" ]');
    expect(printed).toBeGreaterThan(lineOf('Interview platform is ready'));
    expect(printed).toBeLessThan(lineOf('Press Ctrl+C to stop'));
  });
});
