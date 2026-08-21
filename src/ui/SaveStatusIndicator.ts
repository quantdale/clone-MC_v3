/**
 * Persistent save-health banner (249-DL-001). Hidden while saves are healthy;
 * shows an amber "delayed" message while writes are retrying and a red
 * "failing" message once storage is unusable. Clears only on verified recovery.
 */

/** Message shown while saves are retrying after a transient failure. */
export const DEGRADED_MESSAGE = 'Save delayed — retrying…';

/** Message shown once storage is classified unusable. */
export const FAILED_MESSAGE = 'Saves failing — progress at risk';

export type SaveStatus = 'ok' | 'degraded' | 'failed';

export class SaveStatusIndicator {
  private readonly el: HTMLElement;

  constructor(el: HTMLElement) {
    this.el = el;
  }

  /** Reflect one effective save-health status; `ok` hides the banner. */
  setStatus(status: SaveStatus): void {
    if (status === 'ok') {
      this.el.classList.add('hidden');
      return;
    }
    this.el.textContent = status === 'degraded' ? DEGRADED_MESSAGE : FAILED_MESSAGE;
    this.el.classList.toggle('save-status-degraded', status === 'degraded');
    this.el.classList.toggle('save-status-failed', status === 'failed');
    this.el.classList.remove('hidden');
  }
}
