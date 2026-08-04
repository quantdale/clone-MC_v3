/**
 * Input state interface.
 *
 * Implemented by the InputManager and consumed by the player controller and
 * interaction systems. Isolates the input source from the rest of the game.
 */
export interface MouseDelta {
  /** Yaw change in radians (positive = right). */
  dyaw: number;
  /** Pitch change in radians (positive = up). */
  dpitch: number;
}

export interface InputState {
  moveForward: boolean;
  moveBack: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  jump: boolean;
  sprint: boolean;

  /** Whether pointer lock is currently active. */
  isLocked(): boolean;

  /** Returns accumulated mouse movement since the last call and resets it. */
  consumeMouseDelta(): MouseDelta;

  /** Returns true if a break action was requested since the last call. */
  consumeBreak(): boolean;

  /** Returns true if a place action was requested since the last call. */
  consumePlace(): boolean;

  /** Returns hotbar wheel delta since the last call (positive = scroll down). */
  consumeHotbarDelta(): number;

  /** Returns a hotbar index selected via number keys (1–9 → 0–8), or -1 if none. */
  consumeHotbarIndex(): number;

  /** Returns true if the debug overlay toggle was requested since the last call. */
  consumeDebugToggle(): boolean;
}