import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { assertSafeCandidateName } from './candidate-name.js';

export const CONFIG_FILE = 'exercise.json';

export interface RunConfig {
  start: string | null;
  description: string | null;
  port: number | null;
  serverPort: number | null;
  install: string | null;
}

export interface ExerciseConfig {
  defaultFile?: string;
  lockedFiles: string[];
  hidden: string[];
  assistantContext: string;
  run: RunConfig;
}

const asStrings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v.length > 0) : [];

const asPort = (value: unknown): number | null => (typeof value === 'number' && value > 0 ? value : null);
const asText = (value: unknown): string | null => (typeof value === 'string' && value ? value : null);

export const EMPTY_RUN: RunConfig = { start: null, description: null, port: null, serverPort: null, install: null };

/** The one config file of an exercise, always read from the template so the candidate never sees it */
export function readExerciseConfig(templatePath: string | undefined | null): ExerciseConfig {
  const empty: ExerciseConfig = { lockedFiles: [], hidden: [], assistantContext: '', run: { ...EMPTY_RUN } };
  if (!templatePath) return empty;
  const file = join(templatePath, CONFIG_FILE);
  if (!existsSync(file)) return empty;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf-8'));
    const run = raw.run ?? {};
    return {
      defaultFile: asText(raw.defaultFile) ?? undefined,
      lockedFiles: asStrings(raw.lockedFiles),
      hidden: asStrings(raw.hidden),
      assistantContext: asText(raw.assistant?.context) ?? '',
      run: {
        start: asText(run.start),
        description: asText(run.description),
        port: asPort(run.port),
        serverPort: asPort(run.serverPort),
        install: asText(run.install),
      },
    };
  } catch {
    return empty;
  }
}

export const exerciseTemplatePath = (exerciseId: string): string =>
  resolve(process.cwd(), 'exercises', assertSafeCandidateName(exerciseId));

/** Config of the exercise a candidate works on, found by the exercise id */
export function readConfigForExercise(exerciseId: string): ExerciseConfig {
  try {
    return readExerciseConfig(exerciseTemplatePath(exerciseId));
  } catch {
    return readExerciseConfig(null);
  }
}
