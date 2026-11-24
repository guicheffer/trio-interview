import { mkdirSync, existsSync, writeFileSync, readFileSync, cpSync, readdirSync, unlinkSync, rmdirSync, statSync, renameSync } from 'fs';
import { resolve, join } from 'path';
import { assertSafeCandidateName, isSafeCandidateName } from './candidate-name.js';

export interface CandidateState {
  name: string;
  theme: 'light' | 'dark';
  currentExercise: string;
  exercisesCompleted: string[];
  lastAccessed: string;
  createdAt: string;
  preferences: Record<string, unknown>;
}

export class CandidateManager {
  private solutionsDir: string;

  constructor() {
    this.solutionsDir = resolve(process.cwd(), '.solutions');
    mkdirSync(this.solutionsDir, { recursive: true });
  }

  private dirFor(name: string): string {
    return join(this.solutionsDir, assertSafeCandidateName(name));
  }

  /**
   * Create a new candidate folder and state.json
   */
  createCandidate(name: string, exerciseId: string): CandidateState {
    const candidateDir = this.dirFor(name);

    // Check if candidate already exists
    if (existsSync(candidateDir)) {
      throw new Error(`Candidate "${name}" already exists`);
    }

    // Create candidate directory
    mkdirSync(candidateDir, { recursive: true });

    // Initialize state
    const state: CandidateState = {
      name,
      theme: 'light',
      currentExercise: exerciseId,
      exercisesCompleted: [],
      lastAccessed: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      preferences: {},
    };

    // Write state.json
    this.saveState(name, state);

    return state;
  }

  /**
   * Get candidate state
   */
  getState(name: string): CandidateState | null {
    if (!isSafeCandidateName(name)) return null;
    const statePath = join(this.solutionsDir, name, 'state.json');

    if (!existsSync(statePath)) {
      return null;
    }

    const data = readFileSync(statePath, 'utf-8');
    return JSON.parse(data) as CandidateState;
  }

  /**
   * Save candidate state
   */
  saveState(name: string, state: CandidateState): void {
    const candidateDir = this.dirFor(name);
    mkdirSync(candidateDir, { recursive: true });

    const statePath = join(candidateDir, 'state.json');
    writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
  }

  /**
   * Update candidate preferences
   */
  updatePreferences(name: string, updates: Partial<CandidateState>): CandidateState {
    const state = this.getState(name);

    if (!state) {
      throw new Error(`Candidate "${name}" not found`);
    }

    const updated: CandidateState = {
      ...state,
      ...updates,
      lastAccessed: new Date().toISOString(),
    };

    this.saveState(name, updated);
    return updated;
  }

  /**
   * Save exercise files to candidate folder
   */
  saveExerciseFiles(name: string, exerciseId: string, exercisePath: string): void {
    const destPath = join(this.dirFor(name), assertSafeCandidateName(exerciseId));
    mkdirSync(destPath, { recursive: true });

    const EXCLUDED = new Set(['.git', 'node_modules', '.next', '.claude', 'dist', 'coverage', 'exercise.json']);

    // Copy all files from exercise to candidate folder
    cpSync(exercisePath, destPath, {
      recursive: true,
      force: true,
      filter: (src) => !EXCLUDED.has(src.split('/').pop() ?? '') && !src.includes('/.'),
    });

    // Mirror: delete files in dest that no longer exist in source
    this.deleteStaleFiles(exercisePath, destPath, EXCLUDED);

    console.log(`[CandidateManager] Synced exercise files for ${name}/${exerciseId}`);
  }

  private deleteStaleFiles(srcDir: string, destDir: string, excluded: Set<string>): void {
    if (!existsSync(destDir)) return;
    const destEntries = readdirSync(destDir);
    for (const entry of destEntries) {
      if (entry === 'state.json') continue; // never delete state
      const destEntry = join(destDir, entry);
      const srcEntry = join(srcDir, entry);
      if (!existsSync(srcEntry)) {
        // File/dir exists in dest but not in source, delete it
        const stat = statSync(destEntry);
        if (stat.isDirectory()) {
          this.removeDir(destEntry);
        } else {
          unlinkSync(destEntry);
        }
      } else if (statSync(destEntry).isDirectory()) {
        this.deleteStaleFiles(srcEntry, destEntry, excluded);
      }
    }
  }

  private removeDir(dir: string): void {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) this.removeDir(p);
      else unlinkSync(p);
    }
    rmdirSync(dir);
  }

  /**
   * Check if candidate exists
   */
  candidateExists(name: string): boolean {
    if (!isSafeCandidateName(name)) return false;
    return existsSync(join(this.solutionsDir, name));
  }

  /**
   * Ensure state.json exists for a candidate (idempotent).
   * Called by the activate endpoint to handle the case where the working
   * directory was created but state.json was never written.
   */
  ensureCandidateState(name: string, exerciseId: string): CandidateState {
    const statePath = join(this.dirFor(name), 'state.json');
    if (existsSync(statePath)) {
      return this.getState(name)!;
    }
    // state.json missing, write it now
    mkdirSync(this.dirFor(name), { recursive: true });
    const state: CandidateState = {
      name,
      theme: 'light',
      currentExercise: exerciseId,
      exercisesCompleted: [],
      lastAccessed: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      preferences: {},
    };
    this.saveState(name, state);
    return state;
  }

  /**
   * Rename a candidate folder: .solutions/oldName → .solutions/newName
   */
  renameCandidate(oldName: string, newName: string): void {
    const oldDir = this.dirFor(oldName);
    const newDir = this.dirFor(newName);
    if (!existsSync(oldDir)) {
      throw new Error(`Candidate "${oldName}" not found`);
    }
    if (existsSync(newDir)) {
      throw new Error(`Candidate "${newName}" already exists`);
    }
    renameSync(oldDir, newDir);
  }

  /**
   * List all candidates
   */
  listCandidates(): string[] {
    if (!existsSync(this.solutionsDir)) {
      return [];
    }

    return readdirSync(this.solutionsDir).filter((name: string) => {
      const path = join(this.solutionsDir, name);
      return statSync(path).isDirectory();
    });
  }
}

// Singleton instance
export const candidateManager = new CandidateManager();
