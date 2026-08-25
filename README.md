# Voxel Game (Three.js)

A browser-based voxel sandbox game inspired by the core mechanics of Minecraft, built with **Three.js**, **TypeScript**, and **Vite**. It features procedurally generated chunked terrain, first-person controls, block destruction/placement, a stackable survival inventory, crafting, dynamic chunk streaming, collision, lighting, audio feedback, ambient world life, and a polished responsive UI.

Fully spec-driven: see [`openspec/`](openspec/) for the capability specs, change proposal, design, task list, and verification evidence.

---

## Features

- **Procedural, deterministic world** — seeded terrain with grass, dirt, stone, sand, gravel, snow, water, lava pockets, bedrock, coal ore, iron ore, trees, distant biomes, and protected underground caves. Same seed + coordinates ⇒ identical terrain.
- **Chunk streaming** — chunks generate, mesh, and unload around the player within a configurable render distance, with distance-prioritized queues, bounded per-frame work, and a non-blocking spawn preload.
- **First-person controls** — pointer lock, mouse look, WASD, sprint, jump, swimming, lava slowdown, gravity, one-block steps, and AABB voxel collision (no falling through terrain).
- **Block interaction** — destructive/placement with Amanatides & Woo voxel raycasting, accurate targeting, bedrock protection, placement validation, selection outline, stack consumption, hardness-based held mining progress, and distinct coal/raw-iron ore drops.
- **Survival inventory** — 9-slot hotbar plus 27 storage slots, stack counts, collected block drops, apples from leaves, persistent inventory state, a usable inventory screen, and a live furnace (place, open, smelt with fuel recipes and XP, persist across unload/reload, and break to drop contents) wired through `LiveBlockEntityHost` and the `block-entities` IndexedDB store.
- **Crafting** — nine transactional recipes for planks, glass, gravel, cobblestone, bricks, sticks, and durable wooden/stone tools, with material checks, output-capacity checks, and a clickable inventory/crafting panel. Right-click a placed furnace instead of placing the held block: its input/fuel/output slots plus the 36 player slots operate over the same 106 container-transaction core (shift-click, split-half/place-one, cursor safety) and burn/cook indicators.
- **Tools** — craftable wooden pickaxes, a stone pickaxe, and a wooden axe speed up preferred block types and wear down visibly with use.
- **Survival loop** — health, hunger, saturation, sprint hunger drain, fall damage, drowning, lava damage, regeneration, death/respawn, and apples as food.
- **World simulation** — unsupported sand and gravel settle downward with bounded updates, deterministic passive pigs and hostile zombies roam and threaten the player, crops grow through random ticks, the live furnace smelts deterministically on the 20-TPS fixed tick (simulating chunks only, burn frozen without cookable input or with blocked output, XP/fuel exact-once), and enchanting/brewing remain headless progression primitives.
- **Lighting & environment** — hemisphere light, shadowed directional sun, smooth day/night cycle with an in-game clock, procedural sky gradient, distance fog, drifting cloud layer, and semi-transparent water.
- **Exploration polish** — automatic one-block step-up traversal, swimming, target outline feedback, focus-safe input release, camera bob, procedural action sounds, and player-centered shadow coverage.
- **Responsive UI** — crosshair, FPS counter, loading indicator, start/pause overlay, debug overlay (F3), and a styled, professional hotbar.
- **Save persistence** — block edits, player pose, inventory stacks (including per-stack components such as tool damage and enchantments), health, hunger, saturation, and — since Change 251 — live furnace state (`input/fuel/output/burnTime/burnTimeTotal/smeltTime/smeltTimeTotal/xp` per furnace chunk) survive chunk unload/reload and page refresh through the durable IndexedDB facade (`GamePersistence`: `block-entities|world|cx|cz` dirty units with last-writer-wins `block-entities` store, degraded-warning quarantine for corrupt/future-version payloads); settings/keybindings/accessibility stay in localStorage.
- **Production tooling** — ESLint, strict TypeScript, Vitest unit tests, Playwright browser tests, and a production build.

---

## Prerequisites

- **Node.js 20+** (matches `engines` in `package.json`)
- **npm**

## Installation

```bash
npm install
```

## Development

```bash
npm run dev
```

Open the printed URL (default `http://localhost:5173`).

## Commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check and build a production bundle to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm test` | Run the Vitest unit test suite |
| `npm run test:coverage` | Run the unit suite with coverage report |
| `npm run test:e2e` | Build and run the headless Playwright browser suite against the production preview |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run `tsc --noEmit` |

### End-to-end tests

The Playwright suite automatically builds and runs the **production artifact** served by `vite preview` in headless Chromium. Its dedicated `VITE_E2E=true` build flag enables test inspection only for this local/CI process; ordinary production builds do not expose the game handle.

```bash
npm run test:e2e
```

The first time you run Playwright you may need to install its browser:

```bash
npx playwright install chromium
```

---

## Game Controls

| Input | Action |
| --- | --- |
| `Click` | Enter pointer lock / resume |
| `W A S D` / arrow keys | Move |
| `Space` | Jump |
| `Space` while submerged | Swim upward |
| `Shift` | Sneak |
| `Ctrl` | Sprint |
| `Mouse` | Look |
| `Left click` (held) | Mine targeted block (hardness-based duration) |
| `Right click` | Place selected block / use — targeting a placed furnace opens it instead of placing (input/fuel/output + player inventory, burn and smelt indicators, shift-click/quick-move, right-click split-half/place-one, cursor safety; closing returns the cursor or drops it) |
| `Esc` (when furnace/crafting open) | Close the open container (cursor/XP settled) before releasing pointer lock |
| `1–9` / `Mouse wheel` | Select hotbar slot |
| `F3` | Toggle debug overlay |
| `C` | Open/close inventory and crafting |
| `R` | Eat an apple when hungry |
| `Esc` | Release pointer lock (pause) |

Gamepad and touch input drive movement/look/actions without pointer lock (246).

---

## Architecture

The codebase is modular with clear separation of concerns:

```
src/
├── config/        # Central tunables (seed, chunk size, render distance, physics, budgets)
├── engine/        # Game, GameLoop, Renderer, InputManager, ResourceManager,
│                  # FixedTickDriver, SimulationClock, RenderInterpolator, WorkerPool
├── world/         # World, Chunk, ChunkManager, ChunkPipeline, ChunkMesher,
│                  # TerrainGenerator, registries, shapes/raycast, block entities
├── worldgen/      # Biome/climate/feature/structure generation stages
├── player/        # Player, PlayerController, PlayerPhysics, PlayerInteraction, SurvivalSystem
├── simulation/    # Deterministic headless systems: entities/mobs/AI, redstone, fluids,
│                  # networking codecs/lifecycles, replay + performance harnesses
├── storage/       # GamePersistence facade over IndexedDB repositories, dirty-save queue,
│                  # autosave coordinator, health monitoring, legacy migration,
│                  # block-entity `block-entities` store (furnaces) since 251
├── inventory/     # Inventory, Hotbar, Crafting, item registry/components, enchanting,
│                  # FurnaceRecipes (smelting results, fuel values, XP per recipe: 110)
├── data/          # Resource ids, registries, biomes, effects, dimensions
├── rendering/     # TextureAtlas, Materials, Lighting, Environment, light engines,
│                  # greedy/template/fluid meshers, worker meshing protocol
├── audio/         # Procedural WebAudio action feedback
├── ui/            # Crosshair, HUD, LoadingIndicator, DebugOverlay, CraftingPanel,
│                  # FurnacePanel (DOM input/fuel/output + 36 player slots, burn/smelt bars, cursor chip: 251)
├── math/          # PRNG, Noise, DDA (voxel raycast), section coordinates
└── main.ts        # Bootstrap + init-error handling
```

Key design decisions:

- **Chunk size 16×64×16**, stored as a `Uint8Array` (16 KB per chunk).
- **Face-culled meshing** — one opaque and one transparent (water/glass) mesh per chunk; shared materials and a single procedural texture atlas. Internal faces are removed.
- **Seeded noise** (`mulberry32` PRNG + value noise) for deterministic world generation — no `Math.random()` in world-critical paths.
- **Procedural textures** — all block art is generated at runtime into a canvas atlas (original, no copyrighted assets).
- **Edit overlay + save snapshot** — `Map<chunkKey, Map<localIndex, blockId>>` preserves edits across unload/reload, while separate versioned seed-scoped snapshots restore world edits and player state after refresh.
- **Bounded streaming** — distance-prioritized generation/mesh queues with per-frame budgets, stale-job version guards, and player freeze until the local safety ring is visible.
- **Runtime hardening** — rejected pointer-lock requests are recoverable, background/blur transitions clear transient input, and dirty remeshes are retained when a bounded queue is full.

## Performance Notes

- Rendering uses a capped device pixel ratio, color-managed output, soft directional shadows that follow the player, and a lightweight procedural sky.
- Generation/meshing is budgeted per frame; the loading screen paints before spawn generation and sprint-streaming does not cause long synchronous freezes.
- Automated/headless Chromium sessions automatically use a smaller render ring, a 1× pixel ratio, and no shadow map so browser tests remain responsive on software rendering.
- Memory stays bounded during exploration (loaded chunk count is capped by render distance); unload releases GPU resources.
- Chunk coordinates support positive and negative values (floor division).

## Known Limitations

- **Meshing** — the shipped path is face-culled meshing; greedy opaque merging (062) exists behind the worker-meshing path, which stays disabled until its validation campaign lands. Both meet the performance target.
- **Stateful block state is session-only** — crop age, farmland moisture, and fire age live in an in-memory overlay: they survive chunk unload/reload within a session but reset to block defaults on page refresh (Change-125 scope; bounded in-session by a 10k-chunk LRU).
- **Live drop randomness** — item/xp drop rolls in the running game use `Math.random`; deterministic replay operates on the seeded headless simulation harness instead of the live composition.
- **Mobile/touch controls** — supported for movement/look/actions via the 246 touch framework; the layout remains desktop-first.
- **Movement scope** — automatic one-block steps and swimming are supported; sprint-jumping, ladders, and slopes are not implemented.
- **Multiplayer** — the shared-simulation/networking stack (222–237) ships as headless, fully tested infrastructure; no live server browser or netcode UI yet.

---

## Spec-Driven Development

The project follows an OpenSpec-style workflow. Artifacts live in [`openspec/`](openspec/):

- `openspec/changes/add-voxel-game/` — the original change proposal, design, task list, and capability specs.
- `openspec/changes/hardening-polish/` — runtime hardening, movement polish, graphics-follow improvements, and current verification evidence.
- Capability specs: `rendering`, `world-generation`, `chunk-system`, `chunk-streaming`, `player-controller`, `block-interaction`, `block-registry`, `inventory-hotbar`, `survival-system`, `world-simulation`, `lighting-environment`, `user-interface`, `performance`.

The verification matrix maps each requirement to its implementation, tests, and status.

## License

This project is a personal/educational demonstration. All block textures are procedurally generated and original; no third-party assets are used.
