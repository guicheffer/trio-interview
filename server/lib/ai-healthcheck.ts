import { spawn } from 'child_process';
import { tmpdir } from 'os';
import { sanitizeEnvironment } from './sanitize-env.js';
import { resolveModelId } from './claude-proxy.js';
import { DEFAULT_MODEL } from '../../shared/models.js';
import { BIN } from './binaries.js';

export interface AiStatus {
  ok: boolean | null;
  message: string;
  model: string;
  checkedAt: number | null;
}

let status: AiStatus = { ok: null, message: 'not checked yet', model: '', checkedAt: null };

export function getAiStatus(): AiStatus {
  return status;
}

export function friendlyAiFailure(text: string): string {
  return text.trim().slice(0, 300) || 'the assistant did not answer. Check that Claude Code is signed in and has budget left.';
}

export function runAiHealthCheck(): Promise<AiStatus> {
  if (process.env.TRIO_SKIP_HEALTHCHECK === '1') {
    status = { ok: null, message: 'skipped (TRIO_SKIP_HEALTHCHECK=1)', model: '', checkedAt: Date.now() };
    return Promise.resolve(status);
  }

  const model = resolveModelId(DEFAULT_MODEL);
  return new Promise((resolve) => {
    const child = spawn(BIN.claude, ['--print', '--permission-mode=bypassPermissions', '--model', model, 'Reply with exactly: OK'], {
      cwd: tmpdir(),
      env: sanitizeEnvironment(tmpdir()) as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let out = '';
    let err = '';
    child.stdout.on('data', d => { out += d.toString(); });
    child.stderr.on('data', d => { err += d.toString(); });

    const timer = setTimeout(() => child.kill('SIGTERM'), 60000);
    const finish = (ok: boolean, message: string) => {
      clearTimeout(timer);
      status = { ok, message, model, checkedAt: Date.now() };
      if (ok) console.log(`[AI check] OK, the chat works with ${model}`);
      else console.error(`\n[AI check] FAILED with ${model}: ${message}\n[AI check] The candidate chat will not work until this is fixed.\n`);
      resolve(status);
    };

    child.on('error', e => finish(false, `could not start the claude CLI: ${e.message}`));
    child.on('exit', code => {
      const ok = code === 0 && /\bOK\b/.test(out) && !/API Error/i.test(out);
      finish(ok, ok ? 'OK' : friendlyAiFailure(out || err));
    });
  });
}
