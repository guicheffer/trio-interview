import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { DEFAULT_CONFIG, parseConfig, type InterviewConfig } from '../../shared/interview-config.js';

export const configPath = () => join(process.cwd(), 'interview.config.yaml');

/** What the interviewer allows. Read each time, so changing the file takes effect without restarting. */
export function readInterviewConfig(path = configPath()): InterviewConfig {
  try {
    if (!existsSync(path)) return DEFAULT_CONFIG;
    return parseConfig(readFileSync(path, 'utf-8'));
  } catch {
    return DEFAULT_CONFIG;
  }
}
