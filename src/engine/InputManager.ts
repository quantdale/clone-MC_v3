import type { InputState, MouseDelta } from './InputTypes';
import { applyMouseLook } from '../simulation/InputWiring';
import {
  actionForKey,
  createDefaultKeybindings,
  type KeybindingAction,
  type KeybindingState,
} from '../simulation/KeybindingFramework';
import { createDefaultSettings, type SettingsStore } from '../simulation/SettingsFramework';

/** Actions that drive player movement and therefore require pointer lock. */
const MOVEMENT_ACTIONS: ReadonlySet<string> = new Set([
  'forward',
  'back',
  'left',
  'right',
  'jump',
  'sprint',
]);

/**
 * Legacy aliases kept alongside the 207 bindings so default play is unchanged:
 * the arrow keys still move and Shift still sneaks / Ctrl still sprints even
 * where the framework's default table binds only one key of a modifier pair. A
 * remapped action stops flowing through its old key immediately (recompute
 * always uses the CURRENT bindings).
 */
const LEGACY_ALIASES: Readonly<Record<string, KeybindingAction>> = {
  ArrowUp: 'forward',
  ArrowDown: 'back',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ShiftLeft: 'sneak',
  ShiftRight: 'sneak',
  ControlLeft: 'sprint',
  ControlRight: 'sprint',
};

/**
 * Collects keyboard / mouse input into a shared InputState consumable by the
 * player controller and interaction systems.
 *
 * Pointer lock is requested on canvas click. While locked, mouse movement is
 * accumulated into a yaw/pitch delta that is consumed (and reset) by
 * consumeMouseDelta(). Break/place actions and the hotbar scroll are queued on
 * the underlying events and consumed once per frame.
 *
 * Movement/jump/sprint/sneak flags are derived from the held key codes
 * intersected with the active 207 keybinding state (plus the legacy arrow /
 * modifier aliases), so a remap applies to subsequent keydowns only and never
 * re-arms a currently held key whose action moved away. Mouse look scales
 * through the 206 settings via applyMouseLook (see InputWiring for the exact scale contract).
 */
export class InputManager implements InputState {
  moveForward = false;
  moveBack = false;
  moveLeft = false;
  moveRight = false;
  jump = false;
  sprint = false;
  sneaking = false;

  private locked = false;

  /** KeyboardEvent.codes currently down (cleared on focus loss / unlock). */
  private readonly heldCodes = new Set<string>();
  private bindings: KeybindingState = createDefaultKeybindings();
  private settings: SettingsStore = createDefaultSettings();

  private dyaw = 0;
  private dpitch = 0;

  private breakQueued = false;
  private breakHeld = false;
  private breakClickQueued = false;
  private breakPressedAt = 0;
  private placeQueued = false;
  private useHeld = false;
  private pickHeld = false;
  /** Analog gamepad/touch movement (246); overwritten each frame by Game. */
  private externalMove: { x: number; y: number } = { x: 0, y: 0 };
  private hotbarDelta = 0;
  private hotbarIndex = -1;
  private debugToggleQueued = false;
  private craftingToggleQueued = false;
  private eatQueued = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onLockChange?: (locked: boolean) => void,
    private readonly onError?: (message: string) => void,
  ) {
    canvas.addEventListener('click', this.onCanvasClick);
    canvas.addEventListener('contextmenu', this.onContextMenu);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
    document.addEventListener('pointerlockerror', this.onPointerLockError);
    document.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('keydown', this.onKeyDown);
    document.addEventListener('keyup', this.onKeyUp);
    document.addEventListener('mousedown', this.onMouseDown);
    document.addEventListener('mouseup', this.onMouseUp);
    document.addEventListener('wheel', this.onWheel, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    window.addEventListener('blur', this.onWindowBlur);
  }

  /** Requests pointer lock on the canvas (no-op if already locked). */
  lock(): void {
    if (!this.locked) {
      try {
        // Chromium exposes requestPointerLock() as a promise in newer builds,
        // while older DOM typings/runtime combinations return void. Wrapping
        // both forms prevents a rejected lock request from becoming an
        // unhandled promise rejection.
        void Promise.resolve(this.canvas.requestPointerLock()).catch(this.handlePointerLockError);
      } catch {
        this.handlePointerLockError();
      }
    }
  }

  isLocked(): boolean {
    return this.locked;
  }

  /** Replaces the active 207 keybinding state; held keys re-resolve immediately. */
  setBindings(state: KeybindingState): void {
    this.bindings = state;
    this.recomputeMovement();
  }

  /** Replaces the active 206 settings store (mouse look scale/invertY/autoJump). */
  setSettings(store: SettingsStore): void {
    this.settings = store;
  }

  /** Whether 206's autoJump is enabled (the ground check stays with the controller). */
  wantsAutoJump(): boolean {
    return this.settings.autoJump === true;
  }

  /** E2E observability: snapshot of the currently held key codes. */
  heldCodesView(): string[] {
    return [...this.heldCodes];
  }

  /** E2E observability: the active keybinding state (immutable). */
  bindingsView(): KeybindingState {
    return this.bindings;
  }

  /** Non-consuming mouse delta read for the per-frame device frame. */
  peekMouseDelta(): MouseDelta {
    return { dyaw: this.dyaw, dpitch: this.dpitch };
  }

  /** Non-consuming queued hotbar slot for the per-frame device frame. */
  peekHotbarIndex(): number {
    return this.hotbarIndex;
  }

  /** Non-consuming queued wheel delta for the per-frame device frame. */
  peekHotbarDelta(): number {
    return this.hotbarDelta;
  }

  /** Whether the right mouse button is currently held (use). */
  isUseHeld(): boolean {
    return this.useHeld;
  }

  /** Whether the middle mouse button is currently held (pick block). */
  isPickHeld(): boolean {
    return this.pickHeld;
  }

  /**
   * Analog movement contributed by gamepad/touch (246), set by Game each frame
   * from the resolved coordinator output. Zero while pointer-locked, where the
   * keyboard owns movement exactly as before.
   */
  setExternalMove(move: { x: number; y: number }): void {
    this.externalMove = { x: move.x, y: move.y };
  }

  /** The current analog movement in the coordinator's axis convention. */
  analogMove(): { x: number; y: number } {
    return this.externalMove;
  }

  /** Release pointer lock and clear movement without removing input listeners. */
  releasePointerLock(): void {
    this.locked = false;
    this.resetPointerInput();
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  consumeMouseDelta(): MouseDelta {
    const delta: MouseDelta = { dyaw: this.dyaw, dpitch: this.dpitch };
    this.dyaw = 0;
    this.dpitch = 0;
    return delta;
  }

  consumeBreak(): boolean {
    const value = this.breakQueued;
    this.breakQueued = false;
    return value;
  }

  isBreakHeld(): boolean {
    return this.breakHeld;
  }

  consumeBreakClick(): boolean {
    const value = this.breakClickQueued;
    this.breakClickQueued = false;
    return value;
  }

  consumePlace(): boolean {
    const value = this.placeQueued;
    this.placeQueued = false;
    return value;
  }

  consumeHotbarDelta(): number {
    const delta = this.hotbarDelta;
    this.hotbarDelta = 0;
    return delta;
  }

  consumeHotbarIndex(): number {
    const index = this.hotbarIndex;
    this.hotbarIndex = -1;
    return index;
  }

  consumeDebugToggle(): boolean {
    const value = this.debugToggleQueued;
    this.debugToggleQueued = false;
    return value;
  }

  consumeCraftingToggle(): boolean {
    const value = this.craftingToggleQueued;
    this.craftingToggleQueued = false;
    return value;
  }

  consumeEat(): boolean {
    const value = this.eatQueued;
    this.eatQueued = false;
    return value;
  }

  /** Removes every event listener so the manager can be discarded cleanly. */
  dispose(): void {
    this.canvas.removeEventListener('click', this.onCanvasClick);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    document.removeEventListener('pointerlockchange', this.onPointerLockChange);
    document.removeEventListener('pointerlockerror', this.onPointerLockError);
    document.removeEventListener('mousemove', this.onMouseMove);
    document.removeEventListener('keydown', this.onKeyDown);
    document.removeEventListener('keyup', this.onKeyUp);
    document.removeEventListener('mousedown', this.onMouseDown);
    document.removeEventListener('mouseup', this.onMouseUp);
    document.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    window.removeEventListener('blur', this.onWindowBlur);
    // A disposed game must not leave the pointer locked.
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  private readonly onCanvasClick = (): void => {
    this.lock();
  };

  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  private readonly onPointerLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked) {
      this.resetPointerInput();
    }
    this.onLockChange?.(this.locked);
  };

  private readonly onPointerLockError = (): void => {
    this.handlePointerLockError();
  };

  private readonly handlePointerLockError = (): void => {
    this.locked = false;
    // Mirror the movement release on lock loss: a failed re-lock must not leave
    // stale movement flags driving the player.
    this.resetPointerInput();
    this.onError?.('Pointer lock failed. Click the canvas to try again.');
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.locked) return;
    // applyMouseLook scales by the 206 settings; its y keeps screen convention
    // (positive = mouse moved down), so negate it to keep dpitch positive when
    // the mouse moves up (matching the "positive = up" convention documented on
    // MouseDelta and Player.pitch). With default settings this reproduces the
    // previous hard-coded `movement * CONFIG.mouseSensitivity` math exactly.
    const look = applyMouseLook(
      { movementX: event.movementX, movementY: event.movementY },
      this.settings,
    );
    this.dyaw += look.x;
    this.dpitch -= look.y;
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const action = actionForKey(this.bindings, event.code);
    // Movement input must stop when pointer lock is lost (pause). A repeated
    // keydown after an unlock must not re-arm the movement flags, otherwise
    // the player keeps walking behind the pause overlay. Non-movement keys
    // (F3, number keys) remain available while paused.
    if (
      !this.locked &&
      (this.isMovementKey(event.code) || (action !== null && MOVEMENT_ACTIONS.has(action)))
    ) {
      return;
    }

    // Track the physical key state for the binding-derived movement flags and
    // the per-frame keyboard device frame. Autorepeat adds are idempotent.
    this.heldCodes.add(event.code);

    switch (event.code) {
      case 'F3':
        this.debugToggleQueued = true;
        break;
      case 'KeyC':
        this.craftingToggleQueued = true;
        break;
      case 'KeyR':
        this.eatQueued = true;
        break;
      default:
        break;
    }

    if (action !== null && action.startsWith('hotbar') && !event.repeat) {
      // Bound hotbar keys select a slot once per physical press (no autorepeat).
      const slot = Number(action.slice('hotbar'.length));
      if (Number.isInteger(slot)) {
        // hotbar1..hotbar9 → slot index 0–8.
        this.hotbarIndex = slot - 1;
      }
    }

    this.recomputeMovement();

    if (
      action !== null ||
      this.isMovementKey(event.code) ||
      event.code === 'F3' ||
      event.code === 'KeyC' ||
      event.code === 'KeyR'
    ) {
      event.preventDefault();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const action = actionForKey(this.bindings, event.code);
    this.heldCodes.delete(event.code);
    this.recomputeMovement();
    if (this.isMovementKey(event.code) || (action !== null && MOVEMENT_ACTIONS.has(action))) {
      event.preventDefault();
    }
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (event.button === 0) {
      this.breakQueued = true;
      this.breakHeld = true;
      this.breakPressedAt = performance.now();
    } else if (event.button === 2) {
      this.placeQueued = true;
      this.useHeld = true;
    } else if (event.button === 1) {
      this.pickHeld = true;
    }
  };

  private readonly onMouseUp = (event: MouseEvent): void => {
    if (event.button === 0) {
      this.breakHeld = false;
      if (performance.now() - this.breakPressedAt <= 220) {
        this.breakClickQueued = true;
      }
    } else if (event.button === 2) {
      this.useHeld = false;
    } else if (event.button === 1) {
      this.pickHeld = false;
    }
  };

  private readonly onWheel = (event: WheelEvent): void => {
    this.hotbarDelta += Math.sign(event.deltaY);
  };

  /** Release movement immediately when the page loses focus or is backgrounded. */
  private readonly onWindowBlur = (): void => {
    this.releaseForFocusLoss();
  };

  private readonly onVisibilityChange = (): void => {
    if (document.hidden) {
      this.releaseForFocusLoss();
    }
  };

  private releaseForFocusLoss(): void {
    const wasLocked = this.locked;
    this.locked = false;
    this.resetPointerInput();
    if (wasLocked) {
      this.onLockChange?.(false);
    }
    if (document.pointerLockElement === this.canvas) {
      document.exitPointerLock();
    }
  }

  private resetMovement(): void {
    this.moveForward = false;
    this.moveBack = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.jump = false;
    this.sprint = false;
    this.sneaking = false;
  }

  /**
   * Derive the movement flags from the held codes intersected with the CURRENT
   * bindings plus the legacy arrow/modifier aliases. Runs on every keydown/
   * keyup and binding swap, so a remap applies to subsequent input only: a key
   * still held whose action moved away stops producing it.
   */
  private recomputeMovement(): void {
    let forward = false;
    let back = false;
    let left = false;
    let right = false;
    let jump = false;
    let sprint = false;
    let sneaking = false;
    for (const code of this.heldCodes) {
      const bound = actionForKey(this.bindings, code);
      const alias = LEGACY_ALIASES[code];
      const action = bound ?? alias;
      switch (action) {
        case 'forward':
          forward = true;
          break;
        case 'back':
          back = true;
          break;
        case 'left':
          left = true;
          break;
        case 'right':
          right = true;
          break;
        case 'jump':
          jump = true;
          break;
        case 'sneak':
          sneaking = true;
          break;
        case 'sprint':
          sprint = true;
          break;
        default:
          break;
      }
    }
    this.moveForward = forward;
    this.moveBack = back;
    this.moveLeft = left;
    this.moveRight = right;
    this.jump = jump;
    this.sprint = sprint;
    this.sneaking = sneaking;
  }

  /** Clear input that must never leak across a pause or focus transition. */
  private resetPointerInput(): void {
    // Clearing the held codes enforces the re-arm rule: a keyup that arrives
    // while unfocused/paused cannot resurrect an action, and only a fresh
    // physical keydown re-arms movement after refocus.
    this.heldCodes.clear();
    this.resetMovement();
    this.dyaw = 0;
    this.dpitch = 0;
    this.breakQueued = false;
    this.breakHeld = false;
    this.breakClickQueued = false;
    this.breakPressedAt = 0;
    this.placeQueued = false;
    this.useHeld = false;
    this.pickHeld = false;
    this.externalMove = { x: 0, y: 0 };
    this.hotbarDelta = 0;
    this.debugToggleQueued = false;
    this.craftingToggleQueued = false;
    this.eatQueued = false;
  }

  /** Whether a key code drives player movement (and thus requires pointer lock). */
  private isMovementKey(code: string): boolean {
    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
      case 'KeyS':
      case 'ArrowDown':
      case 'KeyA':
      case 'ArrowLeft':
      case 'KeyD':
      case 'ArrowRight':
      case 'Space':
      case 'ShiftLeft':
      case 'ShiftRight':
      case 'ControlLeft':
      case 'ControlRight':
        return true;
      default:
        return false;
    }
  }
}
