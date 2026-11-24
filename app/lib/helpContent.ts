export type HelpRole = 'candidate' | 'interviewer';

export interface HelpStep {
  title: string;
  body: string[];
  links?: { label: string; href: string }[];
}

const candidateSteps: HelpStep[] = [
  {
    title: 'Welcome',
    body: [
      'This is your workspace: files on the left, the editor in the middle, a terminal at the bottom and the AI assistant on the right.',
      'Your interviewer sees your work live and shares the next phase when you are ready. Your work saves by itself.',
    ],
  },
  {
    title: 'Work with the AI assistant',
    body: [
      'Use it the way you would at work: ask it to explain code, find bugs, write and review changes. It is part of the interview.',
      'Say what you are trying to do and why. Read what it writes before you accept it.',
      'Whichever assistant you pick edits your files directly, and your work saves as it goes. With the chat, the changes show in the editor and you can keep or undo each one, and a sparkle in the file list marks a file it wrote to. In Claude Code and OpenCode you read the changes in the terminal, and you can undo them in the editor like any edit.',
    ],
  },
  {
    title: 'Run your code',
    body: [
      'Use Run (or Cmd or Ctrl + Enter) to start the exercise. Web apps open in a preview tab.',
      'Cmd or Ctrl + K opens the command palette and ? lists the shortcuts. Files marked with a lock are read only.',
    ],
  },
  {
    title: 'If something breaks',
    body: [
      'Tell your interviewer. Reloading the page keeps your work.',
      'You can open this help again from the menu at the top right.',
    ],
  },
];

const interviewerSteps: HelpStep[] = [
  {
    title: 'What you see',
    body: [
      'You are looking at the candidate\'s workspace live: their files, editor, terminal, preview and chats.',
      'Follow mirrors their open file and scroll. Turn it off to look around on your own; content and cursors stay live.',
      'Switch candidate goes back to the list of who is online.',
    ],
  },
  {
    title: 'Phases and hidden files',
    body: [
      'Later phases start hidden. In the file tree, reveal them one by one with the eye button, or all at once. They show up for the candidate within seconds.',
      'Files with a lock are read only for the candidate. You can still edit them.',
    ],
  },
  {
    title: 'The AI assistant',
    body: [
      'Every candidate message is paid for by the account your assistant is signed in to, so check you have enough left before you start.',
      'If the assistant stops working the chat is blurred for the candidate and you see the reason here.',
      'Every assistant edits and saves files directly. With the chat, the changes of the open file show in the editor with Keep and Undo, a sparkle marks files it wrote to and a pencil marks files changed since the exercise started. With Claude Code and OpenCode you see the same terminal as the candidate, and the pencil still marks changed files, but there is no Keep and Undo and no sparkle.',
    ],
  },
  {
    title: 'After the interview',
    body: [
      'Run make export to get the code and the conversations as a zip, then the evaluate-candidate skill for a report. make stop closes everything.',
    ],
  },
  {
    title: 'Where to read more',
    body: ['README.md, SECURITY.md and docs/ in the project folder explain how it works, what it protects and what it does not.'],
  },
];

export function helpSteps(role: HelpRole): HelpStep[] {
  return role === 'interviewer' ? interviewerSteps : candidateSteps;
}
