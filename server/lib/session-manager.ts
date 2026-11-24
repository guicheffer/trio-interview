import { ClaudeProxy } from './claude-proxy.js';
import { DEFAULT_MODEL, type ModelKey } from '../../shared/models.js';
import { currentExercisePath } from './default-exercise.js';

// Singleton session manager
class SessionManager {
  private sessions = new Map<string, ClaudeProxy>();
  private sessionModels = new Map<string, string>();

  getOrCreate(sessionId: string, model?: ModelKey): ClaudeProxy {
    if (!this.sessions.has(sessionId)) {
      const effectiveModel = model || DEFAULT_MODEL;
      const exercisePath = currentExercisePath();
      const proxy = new ClaudeProxy(sessionId, exercisePath, effectiveModel);

      proxy.on('exit', () => {
        this.sessions.delete(sessionId);
        this.sessionModels.delete(sessionId);
        console.log(`Session ${sessionId} cleaned up`);
      });

      this.sessions.set(sessionId, proxy);
      this.sessionModels.set(sessionId, effectiveModel);
      console.log(`Session ${sessionId} created with model: ${effectiveModel}`);
    } else if (model) {
      // Session exists, just update the model for next message (don't recreate, SSE would break)
      const existingModel = this.sessionModels.get(sessionId);
      if (existingModel !== model) {
        console.log(`Session ${sessionId} model updated: ${existingModel} → ${model}`);
        this.sessions.get(sessionId)!.setModel(model);
        this.sessionModels.set(sessionId, model);
      }
    }

    return this.sessions.get(sessionId)!;
  }

  get(sessionId: string): ClaudeProxy | undefined {
    return this.sessions.get(sessionId);
  }

  /** Every assistant session of the interview (the interviewer's tab and the candidate's have one each) */
  all(): ClaudeProxy[] {
    return [...this.sessions.values()];
  }

  end(sessionId: string): void {
    const proxy = this.sessions.get(sessionId);
    if (proxy) {
      proxy.kill();
      this.sessions.delete(sessionId);
      this.sessionModels.delete(sessionId);
    }
  }

  endAll(): void {
    for (const proxy of this.sessions.values()) {
      proxy.kill();
    }
    this.sessions.clear();
    console.log('All sessions ended');
  }
}

export const sessionManager = new SessionManager();

// Cleanup on process exit
process.on('SIGTERM', () => {
  console.log('SIGTERM received, cleaning up sessions...');
  sessionManager.endAll();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, cleaning up sessions...');
  sessionManager.endAll();
  process.exit(0);
});
