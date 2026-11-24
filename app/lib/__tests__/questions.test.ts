import { describe, expect, test } from 'vitest';
import { splitQuestions } from '../questions';

const block = (json: unknown, close = true) => '```trio-question\n' + JSON.stringify(json) + (close ? '\n```' : '');

describe('splitQuestions', () => {
  test('text without a block is returned as it is', () => {
    expect(splitQuestions('just an answer')).toEqual({ text: 'just an answer', questions: [] });
  });

  test('cuts the block out of the text and returns the questions', () => {
    const content = `Before\n${block({ questions: [{ question: 'Which?', options: ['a', 'b'] }] })}\nAfter`;
    const result = splitQuestions(content);

    expect(result.text).toBe('Before\n\nAfter');
    expect(result.questions).toEqual([{ question: 'Which?', options: ['a', 'b'], multiSelect: false }]);
  });

  test('keeps multiSelect, limits questions to 3 and options to 5, stringifies options', () => {
    const questions = Array.from({ length: 5 }, (_, i) => ({ question: `Q${i}`, options: [1, 2, 3, 4, 5, 6, 7], multiSelect: i === 0 }));
    const result = splitQuestions(block({ questions }));

    expect(result.questions).toHaveLength(3);
    expect(result.questions[0].multiSelect).toBe(true);
    expect(result.questions[0].options).toEqual(['1', '2', '3', '4', '5']);
  });

  test('drops malformed questions', () => {
    const result = splitQuestions(block({ questions: [{ question: 'No options', options: [] }, { options: ['x'] }, null, { question: 'Ok', options: ['y'] }] }));
    expect(result.questions.map(q => q.question)).toEqual(['Ok']);
  });

  test('a block still streaming (no closing fence) hides its text and gives no questions yet', () => {
    const result = splitQuestions('Thinking\n```trio-question\n{"questions": [{"quest');
    expect(result).toEqual({ text: 'Thinking', questions: [] });
  });

  test('invalid json gives no questions and still removes the block', () => {
    expect(splitQuestions('Hi\n```trio-question\nnot json\n```')).toEqual({ text: 'Hi', questions: [] });
  });
});
