import chokidar, { type FSWatcher } from 'chokidar';
import { candidateManager } from './candidate-manager.js';
import { EventEmitter } from 'events';

interface WatcherConfig {
  exercisePath: string;
  exerciseId: string;
  candidateName: string | null;
  debounceMs: number; // Time to wait after last change before saving
}

export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private config: WatcherConfig;
  private hasChanges = false;
  private changeCount = 0;

  constructor(config: WatcherConfig) {
    super();
    this.config = config;
  }

  /**
   * Start watching the exercise directory
   */
  start(): void {
    if (this.watcher) {
      console.log('[FileWatcher] Already watching');
      return;
    }

    console.log('[FileWatcher] Starting watcher for:', this.config.exercisePath);
    console.log(`[FileWatcher] Auto-save after ${this.config.debounceMs / 1000}s of inactivity`);

    // Watch the exercise directory
    this.watcher = chokidar.watch(this.config.exercisePath, {
      // chokidar 4 has no glob support, so ignore with a function
      ignored: (path: string) => /(^|\/)(node_modules|\.git|\.next|\.claude|dist|coverage)(\/|$)/.test(path) || path.endsWith('/description.md'),
      persistent: true,
      ignoreInitial: true, // Don't trigger on initial file scan
      awaitWriteFinish: {
        stabilityThreshold: 300, // Wait 300ms for file to finish writing
        pollInterval: 100,
      },
    });

    // File changed
    this.watcher.on('change', (path: string) => {
      this.handleFileChange('change', path);
    });

    // File added
    this.watcher.on('add', (path: string) => {
      this.handleFileChange('add', path);
    });

    // File deleted
    this.watcher.on('unlink', (path: string) => {
      this.handleFileChange('unlink', path);
    });

    // Error
    this.watcher.on('error', (error: unknown) => {
      console.error('[FileWatcher] Error:', error);
    });

    // Ready
    this.watcher.on('ready', () => {
      console.log('[FileWatcher] Ready and watching for changes');
    });
  }

  /**
   * Handle file change with debounce
   */
  private handleFileChange(event: string, filePath: string): void {
    this.hasChanges = true;
    this.changeCount++;

    console.log(`[FileWatcher] ${event}: ${filePath} (${this.changeCount} changes)`);

    // Emit change event immediately (for UI indicators)
    this.emit('fileChange', { event, filePath, changeCount: this.changeCount });

    // Clear existing timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new timer
    this.debounceTimer = setTimeout(() => {
      this.performAutoSave();
    }, this.config.debounceMs);
  }

  /**
   * Perform auto-save
   */
  private async performAutoSave(): Promise<void> {
    if (!this.hasChanges) {
      return;
    }

    if (!this.config.candidateName) {
      console.log('[FileWatcher] ⏭Skipping auto-save: No candidate logged in');
      return;
    }

    console.log(`[FileWatcher] Auto-saving after ${this.changeCount} changes...`);

    try {
      // Emit saving event (for UI)
      this.emit('saving', { changeCount: this.changeCount });

      // Save files
      candidateManager.saveExerciseFiles(
        this.config.candidateName,
        this.config.exerciseId,
        this.config.exercisePath
      );

      // Update state
      const state = candidateManager.getState(this.config.candidateName);
      if (state && !state.exercisesCompleted.includes(this.config.exerciseId)) {
        candidateManager.updatePreferences(this.config.candidateName, {
          exercisesCompleted: [...state.exercisesCompleted, this.config.exerciseId],
        });
      }

      // Emit saved event (for UI)
      this.emit('saved', { changeCount: this.changeCount });

      console.log(`[FileWatcher] Auto-saved to .solutions/${this.config.candidateName}/${this.config.exerciseId}/`);

      // Reset counters
      this.hasChanges = false;
      this.changeCount = 0;
    } catch (error) {
      console.error('[FileWatcher] Auto-save failed:', error);
      this.emit('saveError', { error });
    }
  }

  /**
   * Update candidate name (when user logs in)
   */
  setCandidateName(candidateName: string): void {
    console.log(`[FileWatcher] Setting candidate: ${candidateName}`);
    this.config.candidateName = candidateName;
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (!this.watcher) {
      return;
    }

    console.log('[FileWatcher] Stopping watcher...');

    // Perform final save if there are changes
    if (this.hasChanges && this.config.candidateName) {
      console.log('[FileWatcher] Performing final save before stopping...');
      await this.performAutoSave();
    }

    // Clear timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // Close watcher
    await this.watcher.close();
    this.watcher = null;

    console.log('[FileWatcher] Stopped');
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      isWatching: this.watcher !== null,
      hasChanges: this.hasChanges,
      changeCount: this.changeCount,
      candidateName: this.config.candidateName,
      exerciseId: this.config.exerciseId,
    };
  }
}

// Global watcher instance
let globalWatcher: FileWatcher | null = null;

export function createFileWatcher(config: WatcherConfig): FileWatcher {
  // Stop existing watcher if any
  if (globalWatcher) {
    globalWatcher.stop();
  }

  globalWatcher = new FileWatcher(config);
  return globalWatcher;
}

export function getFileWatcher(): FileWatcher | null {
  return globalWatcher;
}
