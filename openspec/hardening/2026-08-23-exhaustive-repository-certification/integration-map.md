# Integration Map — Runtime Reachability (2026-08-23 audit)

Entry point: `src/main.ts` → `Game` composition (`src/engine/Game.ts`). Counts below reflect
the campaign's per-file classification, also recorded in `file-audit-manifest.json`.

## Live shipped path
- **Bootstrap:** main.ts (persistence composed + opened BEFORE Game; VITE_E2E-only quality/hook seams)
- **Engine:** Game, GameLoop, Renderer (+context loss/restore), InputManager, ResourceManager,
  FixedTickDriver→SimulationClock (20 TPS), RenderInterpolator, WorkerPool (constructed only by the dormant worker path)
- **World pipeline:** World (edit overlay 10k LRU + state overlay 10k LRU), ChunkManager,
  ChunkPipeline (bounded queues, generation tokens), ChunkMesher (four streams: opaque/cutout/translucent/fluid),
  TerrainGenerator, registries (blocks/states/shapes/raycast), light storage + incremental engines
- **Persistence:** GamePersistence facade → 6 IndexedDB repositories, DirtySaveQueue,
  AutosaveCoordinator (5 s tick + pagehide flush + commit hook), MonitoredSaveSink + StorageHealthMonitor,
  LegacyLocalStorageMigrator (copy-then-verify with attempt markers)
- **Simulation (live subset):** entity managers/physics/tracking, passive+hostile mob baselines,
  breeding, wander/target AI, melee combat, spawn cycles/rules, crop/farmland/fire behaviors,
  bonemeal, random ticks, item-entity + XP-orb stores, SeedRng streams, input coordinator/wiring,
  settings/keybindings/accessibility/gamepad/touch frameworks
- **Rendering live:** TextureAtlas, Materials, Lighting, Environment, LightStorage/LightUpdateEngine,
  VertexLighting/AO, RenderBudget/RenderPerformanceMonitor/MemoryResourceBudget, mob renderers
- **Inventory/UI/audio:** Inventory(+components/equipment), Hotbar, CraftingSystem (recipe panel),
  enchanting session seam, loot tables, harvest rules; Crosshair/HUD/LoadingIndicator/DebugOverlay/
  CraftingPanel/SaveStatusIndicator; GameAudio

## Dormant (compiled, disabled by design)
- Worker meshing: `useWorkers=false`; MeshWorkerEntry is bundled as a Vite worker chunk but never
  instantiated; WorkerJobProtocol/WorkerMeshing exercised via unit tests.

## Unwired infrastructure (compiled into lib graph, no live caller)
- rendering: AnimatedTextureFrame, BiomeTint, BlockLightEngine/SkyLightEngine wrappers,
  FluidSurfaceMesher, TemplateMesher, RenderLayer model, TranslucentGeometry partitioning, WeatherPresentation
- world: VerticalWorldAccess, FluidState/Waterlogging, DimensionManager, chest/furnace/brewing block entities, DoubleChest
- ui: HudParity projection; engine: PauseManager
- worldgen non-live stages: aquifer/cave/nether/end/pipeline modules behind the test-driven matrix
- simulation majority (~105 files): multiplayer codecs/lifecycles, redstone family, pistons,
  portals/dimensions progression, weather/sleep/sound/particles, replay/perf harnesses — all
  headless-pure, unit-tested, designed for later server wiring

## Test-only harnesses
- SimulationHarness, MultiClientLoadHarness, PathfindSaturation, LightSaturation,
  WorkerSaturationHarness, ReleasePerformanceGate drivers, Replay fixtures/verifier,
  ProgressionHarness (tests/support)

## Security boundary summary
- No eval/new Function/innerHTML/document.write anywhere in src/tests/scripts.
- `window.__voxelGame` / `__voxelQualityProfile` gated at build time by `import.meta.env.DEV/VITE_E2E`;
  plain release bundle asserted clean every CI run (scripts/check-release-bundle.mjs).
- localStorage usage limited to settings/keybindings/accessibility + legacy migration reads;
  world state exclusively through IndexedDB repositories.
- No network transports (fetch/XHR/WebSocket) in production code; postMessage confined to the
  dormant worker protocol. No credentials in tree.
