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

  /**
   * Whether the sneak action (Shift by default) is currently held. Optional
   * so existing implementations stay valid; consumers treat absent as false.
   */
  sneaking?: boolean;

  /** Whether pointer lock is currently active. */
  isLocked(): boolean;

  /** Returns accumulated mouse movement since the last call and resets it. */
  consumeMouseDelta(): MouseDelta;

  /** Returns true if a break action was requested since the last call. */
  consumeBreak(): boolean;

  /** Whether the primary action button is still held. */
  isBreakHeld(): boolean;

  /** Whether a very short primary-button press completed since the last call. */
  consumeBreakClick?(): boolean;

  /** Returns true if a place action was requested since the last call. */
  consumePlace(): boolean;

  /** Returns hotbar wheel delta since the last call (positive = scroll down). */
  consumeHotbarDelta(): number;

  /** Returns a hotbar index selected via number keys (1–9 → 0–8), or -1 if none. */
  consumeHotbarIndex(): number;

  /** Returns true if the debug overlay toggle was requested since the last call. */
  consumeDebugToggle(): boolean;

  /** Returns true when the crafting screen toggle was requested. */
  consumeCraftingToggle(): boolean;

  /** Returns true when the food-use key was pressed. */
  consumeEat(): boolean;

  /** Whether 206's autoJump is enabled; optional so existing implementations stay valid. */
  wantsAutoJump?(): boolean;

  /**
   * Current analog movement (gamepad/touch, 246) in the coordinator's axis
   * convention (x = strafe right+, y = forward−); optional so existing
   * implementations stay valid. Keyboard flags remain separate.
   */
  analogMove?(): { x: number; y: number };
}
