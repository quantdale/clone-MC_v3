# Spec: performance

## Contract

- **Purpose**: Provide a measurable desktop performance target and responsive automated/headless operation during ordinary exploration, with bounded per-frame work, bounded memory, hot-path allocation avoidance, localized rebuilds, and adequate unit + browser test coverage.
- **Scope**: Owns the frame-rate target, per-frame work budgets, memory discipline, hot-path allocation rules, rebuild efficiency, and test-coverage expectations. It is the cross-cutting contract the other capabilities map their performance requirements to.
- **Functional requirements**: Frame-rate target; bounded per-frame work; memory discipline; hot-path allocation avoidance; rebuild efficiency; test coverage expectations.
- **Non-functional requirements**: No repeated multi-hundred-ms freezes while streaming; loaded chunk count stays bounded by render distance; memory does not grow indefinitely; at most the owning chunk plus its boundary neighbor is remeshed per block change.
- **Inputs and outputs**: Inputs: measured FPS, loaded/pending chunk counts, memory usage, per-frame update/render timing. Outputs: documented performance measurements, evidence of bounded work/memory, test suite results.
- **Core data structures**: `CONFIG.budgets` (`generatePerFrame`, `meshPerFrame`, `unloadPerFrame`), `maxQueueSize`, chunk queues, `WorldStats`, memory/dispose bookkeeping.
- **Dependencies**: all capabilities (engine, chunk-system, chunk-streaming, rendering, interaction, inventory) whose hot paths must respect the budgets; config for all tunables.
- **Error and edge-case behavior**: Sprinting across many chunk boundaries still respects the per-frame budget; a single block edit triggers a localized rebuild (never the whole world); unload releases CPU and GPU resources so memory stays flat; degenerate cases (many chunks queued at once) are bounded by `maxQueueSize`.
- **Performance expectations**: Desktop quality is tuned toward ~60 FPS around render distance 8 when hardware permits; the current default desktop distance is 6, while automated/headless sessions use distance 2, DPR 1, and no shadows; per-frame generation/mesh/unload work is capped by budgets; hot paths reuse scratch vectors and camera buffers.
- **Acceptance criteria**: The scenarios in "Frame-rate target", "Bounded per-frame work", "Memory discipline", "Hot-path allocation avoidance", "Rebuild efficiency", and "Test coverage expectations" encode the pass/fail conditions.
- **Verification method**: Perf and memory probes plus unit tests (`tests/unit/*`) and e2e (`tests/e2e/game.spec.ts`) against a production build; verification matrix rows PERF-01 through PERF-06.

## ADDED Requirements

### Requirement: Frame-rate target
The game SHALL maintain approximately 60 FPS at a render distance of about 8 chunks on a typical desktop during ordinary exploration; the observed result SHALL be measured and documented.

#### Scenario: Performance measurement
- **WHEN** the game is profiled during normal movement at render distance 8
- **THEN** the measured frame rate is recorded in the verification documentation and meets or justifies deviation from the 60 FPS target

### Requirement: Bounded per-frame work
Chunk generation and meshing SHALL be budgeted per frame (or run asynchronously) so the game does not freeze during ordinary movement.

#### Scenario: No long frames while streaming
- **WHEN** the player sprints across chunk boundaries
- **THEN** per-frame generation/meshing work stays within the configured budget and no repeated multi-hundred-ms freezes occur

### Requirement: Memory discipline
Memory usage MUST NOT grow without bound during normal exploration; chunk unload SHALL release CPU and GPU resources.

#### Scenario: Stable memory over time
- **WHEN** the player explores continuously for an extended period
- **THEN** loaded chunk count stays bounded by render distance and memory does not grow indefinitely

### Requirement: Hot-path allocation avoidance
Per-frame code paths SHALL avoid unnecessary object allocation, reusing vectors and temporary objects in hot paths.

#### Scenario: Allocation audit
- **WHEN** the per-frame update/render code is reviewed or profiled
- **THEN** no avoidable per-frame allocations exist in the main loop hot paths

### Requirement: Rebuild efficiency
Block modifications SHALL rebuild only dirty chunks and their boundary neighbors — never the whole loaded world.

#### Scenario: Localized rebuild
- **WHEN** a single block is changed
- **THEN** at most the owning chunk and its boundary-touching neighbor are remeshed

### Requirement: Test coverage expectations
Deterministic logic (seeded generation, coordinate conversion, registry, dirty propagation, collision helpers, ray traversal, hotbar selection) SHALL be covered by unit tests, and core gameplay flows (init, rendering, movement, collision, break/place, streaming, production build load) SHALL be covered by integration/browser tests.

#### Scenario: Unit suite passes
- **WHEN** the unit test suite runs
- **THEN** all deterministic-logic tests pass

#### Scenario: Browser suite passes
- **WHEN** the browser/integration test suite runs against a production build
- **THEN** the game initializes, renders, and core interactions pass without fatal errors
