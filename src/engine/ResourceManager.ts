/**
 * Tracks GPU / engine resources that need to be disposed so they can be
 * released together and cannot be leaked.
 */
export class ResourceManager {
  private readonly disposables: Array<{ dispose(): void }> = [];

  /** Registers a disposable for later cleanup. */
  track(obj: { dispose(): void }): void {
    this.disposables.push(obj);
  }

  /** Disposes every tracked resource and clears the registry. */
  dispose(): void {
    if (this.disposables.length === 0) {
      return;
    }
    // Snapshot and clear the registry first so a throwing dispose cannot leave
    // it partially cleared — a later dispose() call would otherwise
    // double-dispose the already-released resources.
    const pending = this.disposables.splice(0);
    for (const obj of pending) {
      try {
        obj.dispose();
      } catch (err) {
        console.error('ResourceManager: failed to dispose a tracked resource', err);
      }
    }
  }
}