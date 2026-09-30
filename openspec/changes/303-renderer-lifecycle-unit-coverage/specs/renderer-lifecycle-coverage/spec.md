# Spec: renderer-lifecycle-coverage

## Contract

The class that owns the game's WebGL renderer, camera and scene MUST have
deterministic, headless unit coverage of its construction, failure, lifecycle and
presentation contracts. Behaviour that today is observable only inside a browser
— WebGL unavailability, context loss and restoration, dispose semantics, and
headless pixel-ratio capping — MUST be verifiable without a GPU or a real
browser.

Production rendering behaviour MUST NOT change. Any test seam introduced for this
purpose MUST default to today's exact behaviour.

## Definitions

- **Renderer class**: `src/engine/Renderer.ts`, exported as `Renderer`.
- **WebGL-unavailable**: the environment in which constructing a WebGL renderer
  throws.
- **Context loss**: a `webglcontextlost` event delivered to the canvas.
- **Context restoration**: a `webglcontextrestored` event delivered to the
  canvas, after which the class rebuilds the renderer.
- **Headless**: a browser context in which `navigator.webdriver` is truthy.
- **Test seam**: an injection point that defaults to production behaviour and is
  overridden only by tests.

## Invariants

- Production behaviour of the Renderer class MUST be identical with no seam
  override present.
- The Renderer class MUST remain the single owner of the scene, camera and WebGL
  renderer; this capability does not split ownership.
- Unit tests for this capability MUST NOT require a real WebGL context or a
  browser.
- No coverage threshold may be lowered to accommodate this change.

## ADDED Requirements

### Requirement: WebGL-unavailable construction fails closed

When WebGL renderer construction throws, the class MUST complete construction
without propagating the error, MUST report that the renderer was not created, and
MUST leave the renderer reference null, so the owning game can enter its
initialisation-error state instead of crashing. The canvas context-loss and
context-restoration listeners MUST remain attached so a later restoration can be
handled.

#### Scenario: Construction succeeds

- **GIVEN** an environment in which WebGL renderer construction succeeds
- **WHEN** the class is constructed
- **THEN** it reports that the renderer was created
- **AND** the renderer is configured with the documented output colour space,
  tone mapping, tone-mapping exposure, shadow-map settings and initial size
- **AND** both canvas listeners are attached

#### Scenario: Construction fails closed

- **GIVEN** an environment in which WebGL renderer construction throws
- **WHEN** the class is constructed
- **THEN** construction completes without throwing
- **AND** the class reports that the renderer was not created
- **AND** the renderer reference is null
- **AND** both canvas listeners are still attached

### Requirement: Context loss and restoration are deterministic

On context loss the class MUST mark the renderer as not created, MUST signal the
registered loss callback, and MUST suppress the event's default behaviour. On
context restoration it MUST dispose the previous renderer, attempt to construct a
new one, re-apply the full configuration to the new renderer, and signal the
registered restoration callback — whether or not construction succeeded.

#### Scenario: Context lost

- **GIVEN** a constructed renderer with a registered loss callback
- **WHEN** a context-loss event is delivered
- **THEN** the class reports that the renderer was not created
- **AND** the loss callback is invoked exactly once
- **AND** the event's default behaviour is suppressed

#### Scenario: Context restored successfully

- **GIVEN** a renderer whose context was lost
- **WHEN** a context-restoration event is delivered and construction succeeds
- **THEN** the previous renderer is disposed
- **AND** a new renderer is created and fully re-configured
- **AND** the class reports that the renderer was created
- **AND** the restoration callback is invoked exactly once

#### Scenario: Context restoration fails closed

- **GIVEN** a renderer whose context was lost
- **WHEN** a context-restoration event is delivered and construction throws
- **THEN** construction of the replacement fails without propagating an exception
- **AND** the class reports that the renderer was not created
- **AND** the restoration callback is still invoked exactly once

### Requirement: Disposal is complete and idempotent

Disposal MUST release the renderer's GPU resources, remove both canvas event
listeners, and mark the renderer as not created. Calling disposal more than once
MUST be safe and MUST NOT throw.

#### Scenario: Disposal releases resources

- **GIVEN** a constructed renderer
- **WHEN** disposal is performed
- **THEN** the renderer's dispose is invoked
- **AND** the class reports that the renderer was not created
- **AND** a subsequent context-restoration event no longer reconfigures a renderer

#### Scenario: Repeated disposal is safe

- **GIVEN** a renderer that has already been disposed
- **WHEN** disposal is performed again
- **THEN** no exception is thrown
- **AND** the state remains "not created"

### Requirement: Pixel ratio honours the headless cap and dynamic scale

The applied device pixel ratio MUST be the minimum of the window's device pixel
ratio and the applicable cap — the headless cap when the environment reports
itself as automated, otherwise the standard cap — multiplied by the current
dynamic-resolution scale. Resizing MUST set the renderer size using a viewport
height that is never less than one.

#### Scenario: Standard cap

- **GIVEN** an environment that is not automated and a device pixel ratio above
  the standard cap
- **WHEN** the pixel ratio is applied
- **THEN** the applied ratio is the standard cap multiplied by the current scale

#### Scenario: Headless cap

- **GIVEN** an environment that reports itself as automated and a device pixel
  ratio above the headless cap
- **WHEN** the pixel ratio is applied
- **THEN** the applied ratio is the headless cap multiplied by the current scale

#### Scenario: Device pixel ratio below the cap

- **GIVEN** a device pixel ratio below the applicable cap
- **WHEN** the pixel ratio is applied
- **THEN** the applied ratio is the device pixel ratio multiplied by the current
  scale

#### Scenario: Resize clamps a degenerate viewport height

- **GIVEN** a viewport whose height is zero or negative
- **WHEN** resize is performed
- **THEN** the height used is one
- **AND** the camera aspect reflects the clamped height

### Requirement: Presentation queries and updates are covered

The physical drawing-buffer size MUST be reported as floored, non-negative
dimensions, and MUST be reported as zero-by-zero when no renderer exists. A
frozen dynamic-resolution controller MUST report an unchanged, valid update with
no effective frame time and MUST NOT re-apply the renderer size. Rendering MUST
be a no-op when no renderer exists.

#### Scenario: Drawing-buffer size with a renderer

- **GIVEN** a constructed renderer reporting a physical drawing-buffer size
- **WHEN** the drawing-buffer size is queried
- **THEN** the reported width and height are the floored, non-negative physical
  dimensions

#### Scenario: Drawing-buffer size without a renderer

- **GIVEN** a renderer whose construction failed
- **WHEN** the drawing-buffer size is queried
- **THEN** the reported width and height are both zero

#### Scenario: Frozen dynamic resolution

- **GIVEN** a renderer whose dynamic-resolution updates are frozen
- **WHEN** a frame timing sample is supplied
- **THEN** the update reports no scale change, is valid, and reports no effective
  frame time
- **AND** the renderer size is not re-applied

#### Scenario: Render without a renderer

- **GIVEN** a renderer whose construction failed
- **WHEN** a render is requested
- **THEN** no exception is thrown and no draw occurs

### Requirement: The test seam defaults to production behaviour

Any injection point introduced to make the class testable MUST default to
constructing a real WebGL renderer exactly as before, and MUST be overridden only
by tests. With no override present, the class MUST behave identically to its
pre-change behaviour.

#### Scenario: Default path

- **GIVEN** no seam override is installed
- **WHEN** the class is constructed in a WebGL-capable environment
- **THEN** a real renderer is constructed and configured exactly as before the
  change

#### Scenario: Override is test-only

- **GIVEN** a test that installs a seam override
- **WHEN** the override is removed after the test
- **THEN** subsequent construction uses the default path again

## Error and failure behavior

- A WebGL construction failure MUST be swallowed by the class and reported as
  state; it MUST NOT escape as an exception.
- A context-restoration construction failure MUST be swallowed and reported as
  state; the restoration callback MUST still run.
- Disposal of an already-disposed renderer MUST NOT throw.
- Reading the drawing-buffer size without a renderer MUST return zero
  dimensions rather than throw.

## Performance and resource bounds

- The new unit tests MUST run without a GPU or a browser and MUST complete in
  well under the suite's per-test timeout.
- The seam MUST NOT add per-frame work; it is consulted only at renderer
  construction time.
- No rendered output may change, so no golden re-pin is required and no
  measurable rendering cost is introduced.

## Compatibility and migration

- No product data, save format, or API used by the owning game changes.
- The only production edit is a defaulted, test-tagged construction seam whose
  default path is identical to today's behaviour.
- No visual golden changes.

## Security and integrity

- A construction seam is a controlled injection point in a rendering path. It
  MUST default to the real factory, MUST NOT read any ambient global, and MUST
  NOT be reachable from user input or persisted data.

## Observability

- Construction success/failure, context loss and context restoration MUST remain
  observable through the existing callbacks and the `rendererCreated` state, so
  the unit tests assert the same surface the game already uses.

## Verification mapping

| Requirement | Verification |
|---|---|
| WebGL-unavailable construction fails closed | `Renderer.test.ts` construction-failure case |
| Context loss/restoration deterministic | `Renderer.test.ts` loss, restore-success, restore-failure cases |
| Disposal complete and idempotent | `Renderer.test.ts` disposal cases |
| Pixel ratio honours cap and scale | `Renderer.test.ts` standard-cap, headless-cap, below-cap and resize-clamp cases |
| Presentation queries covered | `Renderer.test.ts` drawing-buffer and frozen-resolution cases |
| Seam defaults to production | `Renderer.test.ts` default-path assertion plus an unchanged-runtime check |
| Coverage improved | `npm run test:coverage` under the locked toolchain reports Renderer.ts coverage greater than 0%, with no threshold lowered |
