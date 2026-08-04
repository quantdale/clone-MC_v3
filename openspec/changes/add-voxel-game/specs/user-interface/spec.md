# Spec: user-interface

## Contract

- **Purpose**: Deliver the in-browser HUD — crosshair, FPS counter, loading indicator, pointer-lock messaging, error state, and debug overlay — over a responsive full-window canvas, usable at common desktop resolutions.
- **Scope**: Owns HUD elements, loading/ready signaling, pointer-lock instructions and pause/click-to-resume flow, fatal init-error display, the debug overlay, and responsive layout. Does not cover the hotbar (inventory-hotbar) or world state (world/chunk systems).
- **Functional requirements**: HUD basics; loading indicator; pointer-lock messaging; error state; debug overlay; desktop usability.
- **Non-functional requirements**: HUD elements remain unobstructed at 1920×1080 and 1366×768; init failures (missing DOM elements, WebGL unavailable) show a readable error with no uncaught exception escaping; debug stats update live.
- **Inputs and outputs**: Inputs: frame rate samples, world readiness (spawn area loaded), pointer-lock state changes, init failures. Outputs: visible crosshair, FPS text, loading overlay, pause/resume messages, error overlay, debug stats (position, chunk, loaded/pending counts, triangles).
- **Core data structures**: `Crosshair`, `HUD` (FPS counter), `LoadingIndicator`, `DebugOverlay`, `WorldStats` (read by debug overlay), index.html overlay elements, `showFatalError`.
- **Dependencies**: engine (GameLoop for FPS, world readiness), world/chunk-streaming (`WorldStats`, loaded-chunk counts), player-controller (position for debug), main.ts bootstrap.
- **Error and edge-case behavior**: WebGL init failure displays a readable error message rather than a blank page; pointer-lock loss shows a click-to-resume message and re-acquires lock on click; the loading indicator hides once the spawn area is ready; debug overlay toggles with F3 and updates live.
- **Performance expectations**: HUD updates at most once per frame with no allocation in the loop; debug text rendering avoids per-frame DOM churn — see performance spec.
- **Acceptance criteria**: The scenarios in "HUD basics", "Loading indicator", "Pointer-lock messaging", "Error state", "Debug overlay", and "Desktop usability" encode the pass/fail conditions.
- **Verification method**: e2e `tests/e2e/game.spec.ts` plus static review of `src/main.ts` and `src/ui/*`; verification matrix rows UI-01 through UI-06.

## ADDED Requirements

### Requirement: HUD basics
The UI SHALL include a centered crosshair and an FPS counter, overlaid on a responsive full-window canvas.

#### Scenario: Crosshair visible
- **WHEN** the game is running
- **THEN** a crosshair is rendered at the screen center

#### Scenario: FPS counter updates
- **WHEN** the game runs
- **THEN** the FPS counter reflects the measured frame rate, updating periodically

### Requirement: Loading indicator
The UI SHALL show a loading/world-generation indicator while initial chunks generate, and hide it once the world is ready.

#### Scenario: Loading flow
- **WHEN** a session starts and initial chunks are still generating
- **THEN** a loading indicator is visible; it disappears when the spawn area is ready

### Requirement: Pointer-lock messaging
The UI SHALL show pointer-lock instructions before play begins and a pause/click-to-resume message whenever pointer lock is lost.

#### Scenario: Resume message
- **WHEN** pointer lock is released
- **THEN** a message tells the player to click to resume; clicking re-acquires pointer lock

### Requirement: Error state
Unrecoverable initialization failures (e.g. missing DOM elements, WebGL unavailable) SHALL produce a visible error state rather than a silent blank page or uncaught exception.

#### Scenario: WebGL unavailable
- **WHEN** WebGL initialization fails
- **THEN** a readable error message is displayed and no uncaught exception escapes

### Requirement: Debug overlay
A debug overlay SHALL be available showing useful diagnostics such as player position, current chunk, loaded chunk count, pending generation/mesh counts, and rendered triangle count.

#### Scenario: Debug data
- **WHEN** the debug overlay is toggled on
- **THEN** position, chunk coordinates, loaded/pending chunk counts, and triangle count are displayed and update live

### Requirement: Desktop usability
The UI SHALL remain usable and readable at common desktop browser resolutions; keyboard and mouse are the required control scheme (mobile controls are not required).

#### Scenario: Common resolutions
- **WHEN** the game is viewed at 1920×1080 and 1366×768
- **THEN** all HUD elements are visible and unobstructed
