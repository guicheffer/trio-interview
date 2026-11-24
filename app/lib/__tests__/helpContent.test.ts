import { describe, expect, test } from 'vitest';
import { helpSteps } from '../helpContent.js';

const linksOf = (role: 'candidate' | 'interviewer') => helpSteps(role).flatMap(s => s.links ?? []).map(l => l.href);

describe('help content', () => {
  test('no step sends anyone to an outside link', () => {
    expect(linksOf('interviewer')).toEqual([]);
    expect(linksOf('candidate')).toEqual([]);
  });

  test('a candidate is sent to the interviewer, with no internal links', () => {
    expect(linksOf('candidate')).toEqual([]);
    const text = helpSteps('candidate').flatMap(s => s.body).join(' ');
    expect(text).toMatch(/interviewer/i);
    expect(text).not.toContain('slack');
  });

  test('every step has a title and some text', () => {
    for (const role of ['candidate', 'interviewer'] as const) {
      for (const step of helpSteps(role)) {
        expect(step.title.length).toBeGreaterThan(0);
        expect(step.body.length).toBeGreaterThan(0);
      }
    }
  });

  test.each(['candidate', 'interviewer'] as const)('%s is told the assistant edits and saves files directly', (role) => {
    const text = helpSteps(role).flatMap(step => step.body).join(' ');
    expect(text).toContain('save');
    expect(text.toLowerCase()).toContain('undo');
  });
});
