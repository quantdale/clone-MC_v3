import './styles.css';
import { Game } from './engine/Game';

/**
 * Application bootstrap.
 *
 * Validates the required DOM elements, constructs the Game, and enters the
 * recoverable init-error state if WebGL or the DOM is unavailable. The fatal
 * error path is shown as a visible message rather than an uncaught exception.
 */
function bootstrap(): void {
  const canvas = document.getElementById('game-canvas');
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
    showFatalError('The game canvas element is missing or invalid.');
    return;
  }

  let game: Game;
  try {
    game = new Game(canvas);
  } catch (err) {
    showFatalError(
      `Failed to initialize the game: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  if (!game.rendererOk) {
    game.showError('WebGL is not available in this browser. Please enable hardware acceleration or try a different browser.');
    // Release the partially constructed game (DOM listeners, world data, GPU
    // resources) so the error screen does not sit on live engine resources.
    game.dispose();
    return;
  }

  // F3 toggles the debug overlay.
  game.start();

  // Test/debug hook: exposes the running game instance so e2e tests can verify
  // world state (block reads) and drive the camera deterministically. It is
  // only enabled in dev builds or when the `?e2e=1` query flag is present, so
  // normal production visitors never get a script-accessible game handle.
  const e2eRequested = new URLSearchParams(window.location.search).has('e2e');
  if (import.meta.env.DEV || e2eRequested) {
    (window as unknown as { __voxelGame?: Game }).__voxelGame = game;
  }
}

function showFatalError(message: string): void {
  const errorEl = document.getElementById('error');
  const msgEl = document.getElementById('error-message');
  if (msgEl) {
    msgEl.textContent = message;
  }
  if (errorEl) {
    errorEl.classList.remove('hidden');
  }
}

bootstrap();