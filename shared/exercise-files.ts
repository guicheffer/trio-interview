/**
 * The files `make new-exercise` writes. It is plain data and strings so a test can check what a new exercise looks like
 * without touching the disk. The exercise runs as soon as it is made, even with no code in it yet.
 */

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

export type Kind = 'script' | 'web';

export interface NewExercise {
  id: string;
  title: string;
  kind: Kind;
  /** Minutes the interviewer plans for it, only used in the brief */
  minutes: number;
}

/** A folder name that is safe on every system and in `exercises/<id>`: lowercase letters, digits and dashes */
export function isExerciseId(value: string): boolean {
  return ID.test(value) && !value.endsWith('-');
}

/** Turns "Word Count!" into "word-count", so a title is enough to get a valid id */
export function idFromTitle(title: string): string {
  return title.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
}

export function exerciseJson(ex: NewExercise): string {
  const web = ex.kind === 'web';
  const config = {
    defaultFile: 'description.md',
    lockedFiles: ['description.md', ...(web ? ['phases/'] : [])],
    hidden: [] as string[],
    run: web
      ? { start: 'cd codebase && npm install && npm run dev', description: 'Install dependencies and start the app', port: 5173, serverPort: 3002, install: 'cd codebase && npm install' }
      : { start: 'node main.js', description: 'Run main.js', port: null },
    assistant: {
      context: web
        ? 'A web app in codebase/. Run it with the Run button. description.md is the brief the candidate reads first.'
        : 'A small one file exercise. main.js is the starting point and runs with `node main.js`. description.md is the brief the candidate reads first.',
    },
  };
  return JSON.stringify(config, null, 2) + '\n';
}

export function descriptionMd(ex: NewExercise): string {
  return `# ${ex.title}

A ${ex.minutes} minute exercise.

## Objective

Say in one or two sentences what the candidate builds or fixes.

## Requirements

1. The first thing the candidate does
2. The second thing
3. The third thing

## Getting started

${ex.kind === 'web' ? 'Open `codebase/`, run the app with the Run button and ask the assistant to explain it.' : 'Open `main.js`, ask the assistant to help, and run it with `node main.js`.'}

## What you will be asked about

You can explain your approach to the interviewer at any point.
`;
}

export function starterJs(ex: NewExercise): string {
  return `/**
 * ${ex.title}
 *
 * Replace this with the starting code of the exercise.
 * Run with: node main.js
 */

console.log('Ready');
`;
}

/** Everything a new exercise needs, as relative path to content, in the order it is written */
export function newExerciseFiles(ex: NewExercise): Record<string, string> {
  const files: Record<string, string> = {
    'description.md': descriptionMd(ex),
    'exercise.json': exerciseJson(ex),
  };
  if (ex.kind === 'web') {
    files['phases/phase-1.md'] = `# Phase 1\n\nWhat the candidate does first.\n`;
    files['codebase/.gitkeep'] = '';
  } else {
    files['main.js'] = starterJs(ex);
    files['package.json'] = '{}\n';
  }
  return files;
}
