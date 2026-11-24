import { describe, expect, test } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(process.cwd(), 'examples', 'gearshare');
const read = (path: string) => readFileSync(join(root, path), 'utf-8');
const key = readFileSync(join(process.cwd(), 'docs', 'interviewers', 'gearshare.md'), 'utf-8');

// The three planted bugs are what phase 2 is about. If one gets fixed by accident, or the answer key drifts away from the
// code, the exercise stops working, and nothing else in the platform's tests would notice (the example has its own tests).
describe('the GearShare exercise', () => {
  const pricing = read('codebase/src/server/pricing.ts');
  const loans = read('codebase/src/server/loans.ts');

  test('the three bugs are still planted', () => {
    expect(pricing).toContain('aStart <= bEnd && bStart <= aEnd');
    expect(pricing).toContain('days > 7 ? 0.1');
    expect(loans).toContain("if (next === 'cancelled' && loan.borrower_id !== actorId) throw");
  });

  test('the answer key names each bug and its fix', () => {
    expect(key).toContain('aStart < bEnd && bStart < aEnd');
    expect(key).toContain('days >= 7');
    expect(key).toContain('loan.borrower_id !== actorId && item.owner_id !== actorId');
  });

  test('the answer key is not inside the folder the candidate can read', () => {
    expect(key.length).toBeGreaterThan(0);
    expect(() => readFileSync(join(root, 'docs', 'gearshare.md'), 'utf-8')).toThrow();
    for (const file of ['description.md', 'exercise.json', 'phases/phase-1-comprehension.md']) {
      expect(read(file)).not.toMatch(/planted|answer key|<= bEnd|days > 7/i);
    }
  });

  test('the assistant overview does not describe a bug, the feature or a fix', () => {
    const context: string = JSON.parse(read('exercise.json')).assistant.context;
    expect(context).not.toMatch(/\bbug|\bfix|blocked dates|block dates|discount|planted/i);
  });

  test('the later phases start hidden, and the brief does not name them', () => {
    const config = JSON.parse(read('exercise.json'));
    expect(config.hidden).toEqual(expect.arrayContaining(['phases/phase-2-bug-fixing.md', 'phases/phase-3-feature-development.md', 'phases/phase-4-pair-review.md']));
    expect(read('description.md')).not.toMatch(/phase-2|phase-3|phase-4|bug|feature/i);
  });
});
