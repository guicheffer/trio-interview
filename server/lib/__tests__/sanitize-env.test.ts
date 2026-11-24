import { describe, test, expect, beforeEach } from 'vitest';
import { sanitizeEnvironment } from '../sanitize-env.js';

describe('sanitizeEnvironment', () => {
  beforeEach(() => {
    // Set up mock environment (modify in place, don't reassign)
    process.env.AWS_ACCESS_KEY_ID = 'AKIAIOSFODNN7EXAMPLE';
    process.env.AWS_SECRET_ACCESS_KEY = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-api03-test';
  });

  test('strips AWS credentials', () => {
    const env = sanitizeEnvironment('/tmp/exercise');

    expect(env.AWS_ACCESS_KEY_ID).toBeUndefined();
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    expect(env.AWS_SESSION_TOKEN).toBeUndefined();
  });

  test('keeps the Anthropic API key, the Claude CLI needs it to authenticate', () => {
    const env = sanitizeEnvironment('/tmp/exercise');

    expect(env.ANTHROPIC_API_KEY).toBe('sk-ant-api03-test');
  });

  test('preserves allowed variables', () => {
    const env = sanitizeEnvironment('/tmp/exercise');

    expect(env.PATH).toBeDefined();
    expect(env.NODE_ENV).toBe('test');
  });

  test('keeps the real HOME and scopes PWD to the exercise directory', () => {
    const exercisePath = '/tmp/exercise';
    const env = sanitizeEnvironment(exercisePath);

    expect(env.HOME).toBe(process.env.HOME);
    expect(env.PWD).toBe(exercisePath);
  });
});
