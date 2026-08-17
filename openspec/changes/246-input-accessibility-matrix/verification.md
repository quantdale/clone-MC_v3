# Verification: 246-input-accessibility-matrix

Status: NOT VERIFIED
Completion: 0%
Advancement allowed: false

## Requirement evidence
| Requirement | Evidence | Status |
|---|---|---|
| input-dispatch-matrix REQ-1 Action resolution | `tests/unit/InputCoordinator.test.ts` › action union/dedupe/order | |
| input-dispatch-matrix REQ-2 Move arbitration | › move priority and zero-deferral | |
| input-dispatch-matrix REQ-3 Look arbitration | › look priority and zero-deferral | |
| input-dispatch-matrix REQ-4 Held-button merge | › held-button merge across devices | |
| input-dispatch-matrix REQ-5 Hotbar aggregation | › hotbar index/wheel | |
| input-dispatch-matrix REQ-6 Sticky across devices | › per-device release keeps others held | |
| device-input-wiring REQ-1 Remap-aware keyboard | `tests/unit/InputManager`/keyboard helper › remapped binding drives movement | |
| device-input-wiring REQ-2 Remap subsequent-only | › held key not re-armed by remap | |
| device-input-wiring REQ-3 Gamepad poll/disconnect | `tests/e2e/game.spec.ts` › simulated gamepad drives movement/actions | |
| device-input-wiring REQ-4 Touch capture/HUD | `tests/e2e/game.spec.ts` › simulated touch drives movement/actions | |
| device-input-wiring REQ-5 Settings application | unit › sensitivity/invertY/autoJump | |
| device-input-wiring REQ-6 Accessibility application | unit/e2e › reducedMotion/uiScale without changing resolution | |
| device-input-wiring REQ-7 Playable state | `tests/e2e/game.spec.ts` › gamepad/touch lock-free; paused delivers none | |
| focus-loss-recovery REQ-1 Focus loss clears all devices | `tests/e2e/game.spec.ts` › blur/visibility clears keyboard+gamepad+touch | |
| focus-loss-recovery REQ-2 Pointerlockerror recoverable | `tests/e2e/game.spec.ts` › pointerlockerror overlay + relock | |
| focus-loss-recovery REQ-3 Refocus re-arm | `tests/e2e/game.spec.ts` › refocus requires re-press | |
| focus-loss-recovery REQ-4 Per-device clear | `tests/unit/InputCoordinator.test.ts` › clearDevice preserves others | |
| focus-loss-recovery REQ-5 Corrupt payload defaults | unit › corrupt settings/keybindings/accessibility → defaults | |
| focus-loss-recovery REQ-6 Disconnect/cancellation zero | unit/e2e › gamepad disconnect, touchcancel zero the device | |
| focus-loss-recovery REQ-7 Autorepeat no duplication | unit › repeated keydown yields one hotbar signal | |

## Commands
| Command | Result | Evidence/notes |
|---|---|---|
| npm run typecheck | | |
| npm run lint | | |
| npm test | | |
| npm run build | | |
| npm run test:e2e | | |

## Edge/adversarial validation
Not yet run (change unverified). Expected coverage per the capability specs:
- Zero-vector arbitration: a zero move/look never blocks a lower-priority non-zero device.
- Simultaneous-device release-one-keep-other (sticky across devices).
- A key held through a mid-session remap is not re-armed by the remap.
- Corrupt settings/keybindings/accessibility payloads fall back to defaults (no crash).
- Gamepad disconnect mid-hold and touch `touchcancel` zero the device (no stale held action).
- OS key autorepeat yields exactly one hotbar/UI edge-triggered signal.
- A paused game delivers no input from any device.

## Migration/compatibility validation
Not yet run (change unverified). Expected result: no 206-210 format or contract change; `InputState`
interface preserved (`PlayerController`/`PlayerInteraction` keep compiling); corrupt-payload default
fallback is additive at load.

## Performance/resource validation
Not yet run (change unverified). Expected result: `resolveFrame` is O(actions × 4) with a constant
device count; `clearAll`/`clearDevice` are O(1); one `getGamepads()` poll and one `resolveTouches`
per frame; no tick/simulation hot-path change.

## Regressions
Not yet run (change unverified). Expected result: the prior unit suite and e2e assertions remain
green, especially "clears movement when the page loses focus", "keeps pointer-lock failures
recoverable", and the WASD movement / hotbar / eat / break-place e2e cases.

## Incomplete tasks
All tasks are pending (0/15 complete). None checked off until implementation, required tests, and
evidence exist per `AGENTS.md` checkbox rule.

## Advancement Exception
Not applicable unless completion is 90-99.99% with an explicit exception per `AGENTS.md`.

## Final decision
Pending. 246 is not yet implemented or verified.
