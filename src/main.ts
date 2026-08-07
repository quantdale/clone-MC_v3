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

  // Dev-only hook: exposes the running game instance so local dev tooling can
  // inspect world state. It is never set in production builds.
  if (import.meta.env.DEV) {
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