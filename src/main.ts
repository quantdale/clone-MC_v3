import './styles.css';
import { Game, type GameQualityOverrides } from './engine/Game';

/**
 * Application bootstrap.
 *
 * Validates the required DOM elements, constructs the Game, and enters the
 * recoverable init-error state if WebGL or the DOM is unavailable. The fatal
 * error path is shown as a visible message rather than an uncaught exception.
 */
function bootstrap(): void {
  const bootstrapWindow = window as Window & { __voxelBootstrapStarted?: boolean };
  if (bootstrapWindow.__voxelBootstrapStarted) {
    return;
  }
  bootstrapWindow.__voxelBootstrapStarted = true;

  const retryButton = document.getElementById('error-retry');
  retryButton?.addEventListener('click', () => window.location.reload());

  const canvas = document.getElementById('game-canvas');
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
    showFatalError('The game canvas element is missing or invalid.');
    return;
  }

  // Test-only boot seam (245): the VITE_E2E build may apply a fixed quality
  // profile injected via Playwright's addInitScript before any page script runs.
  // Shipped builds never read this global.
  let quality: GameQualityOverrides | undefined;
  if (import.meta.env.VITE_E2E === 'true') {
    quality = (
      window as unknown as { __voxelQualityProfile?: GameQualityOverrides }
    ).__voxelQualityProfile;
  }
  let game: Game;
  try {
    game = new Game(canvas, undefined, quality);
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

  // Dev/test hook: the normal production build never exposes the live game.
  // VITE_E2E is supplied only by the local/CI browser-test build and is not a
  // URL-controlled switch that can be enabled by an end user.
  if (import.meta.env.DEV || import.meta.env.VITE_E2E === 'true') {
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
