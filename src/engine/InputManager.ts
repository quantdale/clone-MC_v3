import { CONFIG } from '../config';
import type { InputState, MouseDelta } from './InputTypes';

/**
 * Collects keyboard / mouse input into a shared InputState consumable by the
 * player controller and interaction systems.
 *
 * Pointer lock is requested on canvas click. While locked, mouse movement is
 * accumulated into a yaw/pitch delta that is consumed (and reset) by
 * consumeMouseDelta(). Break/place actions and the hotbar scroll are queued on
 * the underlying events and consumed once per frame.
 */
export class InputManager implements InputState {
  moveForward = false;
  moveBack = false;
  moveLeft = false;
  moveRight = false;
  jump = false;
  sprint = false;

  private locked = false;

  private dyaw = 0;
  private dpitch = 0;

  private breakQueued = false;
  private placeQueued = false;
  private hotbarDelta = 0;
  private hotbarIndex = -1;
  private debugToggleQueued = false;

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
    document.addEventListener('wheel', this.onWheel, { passive: true });
  }

  /** Requests pointer lock on the canvas (no-op if already locked). */
  lock(): void {
    if (!this.locked) {
      this.canvas.requestPointerLock();
    }
  }

  isLocked(): boolean {
    return this.locked;
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
    document.removeEventListener('wheel', this.onWheel);
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
      this.resetMovement();
    }
    this.onLockChange?.(this.locked);
  };

  private readonly onPointerLockError = (): void => {
    this.locked = false;
    // Mirror the movement release on lock loss: a failed re-lock must not leave
    // stale movement flags driving the player.
    this.resetMovement();
    this.onError?.('Pointer lock failed. Click the canvas to try again.');
  };

  private readonly onMouseMove = (event: MouseEvent): void => {
    if (!this.locked) return;
    this.dyaw += event.movementX * CONFIG.mouseSensitivity;
    // Mouse movement Y is positive when the mouse moves down, so negate it to
    // keep dpitch positive when the mouse moves up (matching the "positive = up"
    // convention documented on MouseDelta and Player.pitch).
    this.dpitch -= event.movementY * CONFIG.mouseSensitivity;
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // Movement input must stop when pointer lock is lost (pause). A repeated
    // keydown after an unlock must not re-arm the movement flags, otherwise
    // the player keeps walking behind the pause overlay. Non-movement keys
    // (F3, number keys) remain available while paused.
    if (!this.locked && this.isMovementKey(event.code)) {
      return;
    }

    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.moveForward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.moveBack = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.moveLeft = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.moveRight = true;
        break;
      case 'Space':
        this.jump = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.sprint = true;
        break;
      case 'F3':
        this.debugToggleQueued = true;
        break;
      case 'Digit1':
      case 'Digit2':
      case 'Digit3':
      case 'Digit4':
      case 'Digit5':
      case 'Digit6':
      case 'Digit7':
      case 'Digit8':
      case 'Digit9':
        // Number keys select a hotbar slot (1–9 → slot index 0–8).
        this.hotbarIndex = Number(event.code.charAt(5)) - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    switch (event.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.moveForward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.moveBack = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.moveLeft = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.moveRight = false;
        break;
      case 'Space':
        this.jump = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.sprint = false;
        break;
      default:
        return;
    }
    event.preventDefault();
  };

  private readonly onMouseDown = (event: MouseEvent): void => {
    if (!this.locked) return;
    if (event.button === 0) {
      this.breakQueued = true;
    } else if (event.button === 2) {
      this.placeQueued = true;
    }
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.locked) return;
    this.hotbarDelta += Math.sign(event.deltaY);
  };

  private resetMovement(): void {
    this.moveForward = false;
    this.moveBack = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.jump = false;
    this.sprint = false;
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
        return true;
      default:
        return false;
    }
  }
}