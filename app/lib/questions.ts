export interface AiQuestion {
  question: string;
  options: string[];
  multiSelect?: boolean;
}

const FENCE = '```trio-question';
const CLOSING_FENCE = '```';
const MAX_QUESTIONS = 3;
const MAX_OPTIONS = 5;

function parseQuestions(body: string): AiQuestion[] {
  try {
    const parsed = JSON.parse(body);
    return (Array.isArray(parsed?.questions) ? parsed.questions : [])
      .filter((q: AiQuestion) => q && typeof q.question === 'string' && Array.isArray(q.options) && q.options.length > 0)
      .slice(0, MAX_QUESTIONS)
      .map((q: AiQuestion) => ({ question: q.question, options: q.options.map(String).slice(0, MAX_OPTIONS), multiSelect: !!q.multiSelect }));
  } catch {
    return [];
  }
}

/**
 * The assistant asks with a fenced `trio-question` JSON block. The block (open ended while the answer streams)
 * is cut out of the text and returned as questions the chat renders as buttons.
 */
export function splitQuestions(content: string): { text: string; questions: AiQuestion[] } {
  const start = content.indexOf(FENCE);
  if (start === -1) return { text: content, questions: [] };
  const bodyStart = start + FENCE.length;
  const close = content.indexOf(CLOSING_FENCE, bodyStart);
  const bodyEnd = close === -1 ? content.length : close;
  const after = close === -1 ? '' : content.slice(close + CLOSING_FENCE.length);
  return {
    text: (content.slice(0, start) + after).trim(),
    questions: parseQuestions(content.slice(bodyStart, bodyEnd).trim()),
  };
}
