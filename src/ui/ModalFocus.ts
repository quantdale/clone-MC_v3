/**
 * Modal focus containment and Escape routing (change 304, audit finding F-008).
 *
 * Eleven surfaces in `index.html` declare `role="dialog"`/`role="alertdialog"`
 * with `aria-modal="true"`, which promises assistive technology that the rest of
 * the page is unavailable — yet before this module nothing moved focus into a
 * dialog, nothing contained Tab, nothing marked the background unavailable, and
 * Escape did nothing anywhere in `src/`. A keyboard user tabbed through the HUD
 * behind an open modal, contradicting the declared semantics.
 *
 * The two pure helpers (`focusableOrder`, `nextFocusIndex`, `resolveInitialFocus`)
 * are exported so the containment policy is unit-tested in the node environment;
 * the DOM wiring is proven in the browser suite. No DOM is touched at import time
 * and no dependency was added (no jsdom).
 */

/** Elements that can receive keyboard focus inside a container. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** Attribute set on every non-modal surface while a modal is open. */
export const INERT_ATTRIBUTE = 'inert';

/**
 * Whether a candidate is currently focusable.
 *
 * `offsetParent` is null for `display:none` subtrees, and `inert` subtrees must
 * never be focused. Both are checked because a modal's own panel can be nested
 * inside a container that carries the `hidden` class.
 */
function isFocusable(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hasAttribute('disabled')) return false;
  if (element.closest(`[${INERT_ATTRIBUTE}]`)) return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;
  // A zero-size element with no offsetParent is not rendered.
  if (element.offsetParent === null && element !== document.body) {
    const style = element.ownerDocument.defaultView?.getComputedStyle(element);
    if (style && style.visibility === 'hidden') return false;
    if (style && style.display === 'none') return false;
  }
  return true;
}

/**
 * The focusable descendants of `container` in document order.
 *
 * Pure over the DOM it is handed: it does no global lookup beyond the container's
 * own subtree. Returns an empty array when nothing inside is focusable, which the
 * containment policy treats as "focus stays on the container itself".
 */
export function focusableOrder(container: Element): HTMLElement[] {
  const found = Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(isFocusable);
  return found.filter((element): element is HTMLElement => element instanceof HTMLElement);
}

/**
 * The next focus index for a Tab (`direction = 1`) or Shift+Tab (`-1`) press.
 *
 * Wraps from the last control to the first and from the first to the last, so
 * focus can never leave the modal. Returns `-1` when there is nothing to focus,
 * which callers interpret as "keep focus on the container".
 */
export function nextFocusIndex(currentIndex: number, count: number, direction: 1 | -1): number {
  if (count <= 0) return -1;
  if (count === 1) return 0;
  if (currentIndex < 0 || currentIndex >= count) {
    // Focus is outside the modal (or on the container): start at the near end.
    return direction === 1 ? 0 : count - 1;
  }
  return (currentIndex + direction + count) % count;
}

/**
 * Which element should receive focus when `root` opens.
 *
 * Preference order, per the capability spec:
 *   1. the element matching `preferredSelector` (e.g. a panel's primary button);
 *   2. otherwise the first focusable descendant;
 *   3. otherwise the root itself, made focusable with `tabindex="-1"`.
 *
 * Returns the element to focus and whether the caller must add `tabindex="-1"`.
 */
export function resolveInitialFocus(
  root: HTMLElement,
  preferredSelector?: string,
): { element: HTMLElement; needsTabIndex: boolean } {
  if (preferredSelector) {
    const preferred = root.querySelector(preferredSelector);
    if (preferred instanceof HTMLElement && isFocusable(preferred)) {
      return { element: preferred, needsTabIndex: false };
    }
  }
  const focusables = focusableOrder(root);
  const first = focusables[0];
  if (first) return { element: first, needsTabIndex: false };
  return { element: root, needsTabIndex: root.getAttribute('tabindex') === null };
}

/** One open modal's live state. */
interface ModalSession {
  readonly root: HTMLElement;
  readonly opener: HTMLElement | null;
  readonly onDismiss: () => void;
  /** Surfaces marked inert by this session, so they can be restored exactly. */
  readonly inerted: Element[];
  readonly keydown: (event: KeyboardEvent) => void;
}

/**
 * Owns the focus/inert/Escape lifecycle for the single currently-open modal.
 *
 * Only one modal may be open at a time in this application (the "one container"
 * rule), and the class enforces that: opening a second surface closes the first
 * through its own dismiss path so the DOM never accumulates stale inert
 * attributes or stale listeners.
 */
export class ModalFocus {
  private session: ModalSession | null = null;

  /** The currently open modal root, or null. */
  get openRoot(): HTMLElement | null {
    return this.session?.root ?? null;
  }

  /** Whether a modal is currently open. */
  get isOpen(): boolean {
    return this.session !== null;
  }

  /**
   * Mark the modal open: inert the background, record the opener, move focus in,
   * and install the containment + Escape handlers.
   *
   * `backgroundRoots` are the top-level surfaces that must become unavailable.
   * The open modal's own root is always excluded, even if the caller passes it.
   *
   * Opening the already-open root is a no-op (idempotent).
   */
  open(
    root: HTMLElement,
    onDismiss: () => void,
    options: { preferredSelector?: string; backgroundRoots?: Element[] } = {},
  ): void {
    if (this.session?.root === root) return;

    // Switching surfaces must not leak the previous modal's state.
    if (this.session) this.close();

    const active = document.activeElement;
    const opener = active instanceof HTMLElement && active !== root ? active : null;

    const candidates = options.backgroundRoots ?? [];
    const inerted: Element[] = [];
    for (const surface of candidates) {
      if (surface === root) continue;
      if (surface.hasAttribute(INERT_ATTRIBUTE)) continue;
      surface.setAttribute(INERT_ATTRIBUTE, '');
      inerted.push(surface);
    }

    const initial = resolveInitialFocus(root, options.preferredSelector);
    if (initial.needsTabIndex) initial.element.setAttribute('tabindex', '-1');
    initial.element.focus();

    const keydown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        // Route through the caller's dismiss path, never a private close.
        onDismiss();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusables = focusableOrder(root);
      event.preventDefault();
      if (focusables.length === 0) {
        root.focus();
        return;
      }
      const current = focusables.indexOf(document.activeElement as HTMLElement);
      const index = nextFocusIndex(current, focusables.length, event.shiftKey ? -1 : 1);
      focusables[index]?.focus();
    };

    // Capture so the panel's own handlers cannot swallow Tab/Escape first.
    document.addEventListener('keydown', keydown, true);
    this.session = { root, opener, onDismiss, inerted, keydown };
  }

  /**
   * Close the open modal: remove the listener, clear this session's inert marks,
   * and restore focus to the opener (or the body when it is gone).
   *
   * Idempotent, and safe to call when nothing is open.
   */
  close(): void {
    const session = this.session;
    if (!session) return;
    this.session = null;

    document.removeEventListener('keydown', session.keydown, true);
    for (const surface of session.inerted) surface.removeAttribute(INERT_ATTRIBUTE);

    const { opener } = session;
    if (opener?.isConnected && isFocusable(opener)) {
      opener.focus();
    } else {
      document.body.focus();
    }
  }

  /** Close only if `root` is the open modal (used by a panel's own hide path). */
  closeIfOpen(root: HTMLElement): void {
    if (this.session?.root === root) this.close();
  }

  /** Release everything; used by `Game.dispose()` so nothing survives teardown. */
  dispose(): void {
    this.close();
  }
}
