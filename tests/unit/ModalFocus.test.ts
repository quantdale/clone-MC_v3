import { describe, expect, it } from 'vitest';
import { readSource } from '../support/sourceText';
import { resolve } from 'node:path';

/**
 * Unit coverage for the pure containment policy in `src/ui/ModalFocus.ts`
 * (change 304, audit finding F-008).
 *
 * The environment is `node` and the repository deliberately has no jsdom /
 * happy-dom, so the DOM wiring itself is proven in the browser suite
 * (`tests/e2e/modal-focus.spec.ts`). What is unit-testable — and what actually
 * decides whether focus can escape a modal — is `nextFocusIndex`, plus the
 * documented preference order and the single-dismiss-path structure. Both are
 * pinned here.
 */

// The module reads `HTMLElement`/`document` only inside functions and class
// methods, never at import time, so importing it in the node environment is safe.
const { nextFocusIndex, INERT_ATTRIBUTE } = await import('../../src/ui/ModalFocus');

const MODULE = resolve(__dirname, '../../src/ui/ModalFocus.ts');
const INDEX_HTML = resolve(__dirname, '../../index.html');

describe('ModalFocus focus containment policy (304)', () => {
  describe('nextFocusIndex', () => {
    it('wraps forward from the last control to the first', () => {
      expect(nextFocusIndex(2, 3, 1)).toBe(0);
      expect(nextFocusIndex(4, 5, 1)).toBe(0);
    });

    it('wraps backward from the first control to the last', () => {
      expect(nextFocusIndex(0, 3, -1)).toBe(2);
      expect(nextFocusIndex(0, 5, -1)).toBe(4);
    });

    it('advances to the next control in document order from an interior control', () => {
      expect(nextFocusIndex(1, 3, 1)).toBe(2);
      expect(nextFocusIndex(2, 3, -1)).toBe(1);
      expect(nextFocusIndex(3, 5, 1)).toBe(4);
    });

    it('enters at the near end when focus is outside the container', () => {
      // -1 means "focus was on the container (or nowhere)": Tab starts at the
      // first control, Shift+Tab at the last, so focus moves *into* the modal.
      expect(nextFocusIndex(-1, 3, 1)).toBe(0);
      expect(nextFocusIndex(-1, 3, -1)).toBe(2);
      expect(nextFocusIndex(99, 3, 1)).toBe(0);
      expect(nextFocusIndex(99, 3, -1)).toBe(2);
    });

    it('keeps a single control focused in both directions', () => {
      expect(nextFocusIndex(0, 1, 1)).toBe(0);
      expect(nextFocusIndex(0, 1, -1)).toBe(0);
    });

    it('reports "nothing to focus" for an empty container', () => {
      expect(nextFocusIndex(0, 0, 1)).toBe(-1);
      expect(nextFocusIndex(-1, 0, -1)).toBe(-1);
    });

    it('never escapes the [0, count) range under an exhaustive sweep', () => {
      for (let count = 0; count <= 12; count++) {
        for (let current = -2; current <= count + 2; current++) {
          for (const direction of [1, -1] as const) {
            const index = nextFocusIndex(current, count, direction);
            if (count === 0) expect(index).toBe(-1);
            else {
              expect(index).toBeGreaterThanOrEqual(0);
              expect(index).toBeLessThan(count);
            }
          }
        }
      }
    });
  });

  describe('structure and single dismiss path', () => {
    it('declares the inert attribute once as a constant', () => {
      expect(INERT_ATTRIBUTE).toBe('inert');
    });

    it('uses aria-modal as the inert-keyed semantics and documents all four duties', () => {
      const src = readSource(MODULE);
      for (const duty of ['focus()', 'INERT_ATTRIBUTE', "'Escape'", "'Tab'"]) {
        expect(src, `ModalFocus is missing ${duty}`).toContain(duty);
      }
      // Escape must route to the caller's dismiss path, not a private close.
      expect(src).toMatch(/if \(event\.key === 'Escape'\)[\s\S]{0,120}onDismiss\(\)/);
      // Tab must be contained (preventDefault + wrapped index), never defaulted.
      expect(src).toMatch(/event\.key !== 'Tab'[\s\S]{0,60}return;/);
      expect(src).toMatch(/preventDefault\(\)/);
      // Focus restoration goes through the recorded opener.
      expect(src).toMatch(/opener\.focus\(\)/);
    });

    it('adds tabindex="-1" only when the dialog has no focusable descendant', () => {
      const src = readSource(MODULE);
      expect(src).toMatch(/needsTabIndex/);
      expect(src).toContain("setAttribute('tabindex', '-1')");
    });

    it('removes exactly the inert marks it added (no global clear)', () => {
      const src = readSource(MODULE);
      // The session records what it inerted and unsets only those.
      expect(src).toMatch(/inerted/);
      expect(src).toMatch(/removeAttribute\(INERT_ATTRIBUTE\)/);
    });

    it('every aria-modal surface lives inside a container the helper can inert', () => {
      const html = readSource(INDEX_HTML);
      // 10 shared panel dialogs + the recovery alertdialog + death-screen, which
      // did not declare aria-modal before change 304 (the audit's F-008 gap).
      const modalCount = (html.match(/aria-modal="true"/g) ?? []).length;
      expect(modalCount).toBe(12);
      expect(html).toMatch(/id="death-screen"[^>]*aria-modal="true"/);
      // Every role="dialog"/"alertdialog" surface must also declare aria-modal,
      // so the declared semantics and the real behaviour cannot drift apart.
      const roleSurfaces = [...html.matchAll(/<(\w+)([^>]*role="(?:dialog|alertdialog)"[^>]*)>/g)];
      const missing = roleSurfaces
        .filter(([, , attrs]) => !(attrs ?? '').includes('aria-modal="true"'))
        .map(([, tag, attrs]) => `${tag}${(attrs ?? '').slice(0, 60)}`);
      expect(missing).toEqual([]);
    });
  });
});
