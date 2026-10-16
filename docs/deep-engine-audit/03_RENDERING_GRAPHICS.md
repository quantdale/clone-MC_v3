# 03 — Rendering, Shaders, Lighting and Graphics Audit

## Current position

[VERIFIED] The renderer is Three.js/WebGL-based. The codebase already contains voxel-specific AO, greedy meshing, block/skylight components, biome tinting, animated-texture support, fluid surface meshing, environment/lighting modules and a memory resource budget. Therefore visual work should consolidate and measure these systems rather than introduce a second renderer stack.

## Rendering goals

1. Preserve Minecraft's clean voxel readability.
2. Improve depth, atmosphere, light response and water without turning the game into a generic PBR demo.
3. Make every expensive feature scalable or optional.
4. Keep chunk meshing and GPU uploads off the render-critical path as much as possible.

## Pipeline target

```text
block state + light + biome data
 -> section mesher
 -> opaque stream
 -> cutout stream
 -> translucent/fluid stream
 -> typed vertex/index buffers
 -> bounded main-thread GPU upload
 -> frustum/distance visibility
 -> material-grouped draw submission
 -> sky/environment + entities + particles + UI
```

### Opaque/cutout/translucent separation
Use distinct render queues/material policies:

- opaque blocks: depth-write, front-to-back friendly;
- alpha-tested/cutout foliage: alpha test, avoid blending when possible;
- transparent glass/water: separate geometry and sorting policy; avoid mixing with opaque mesh;
- fluids: dedicated surface mesh/material.

This prevents one transparent block from forcing an entire chunk into a costly blended path.

## Meshing

`GreedyMesher.ts` exists. Benchmark it against the legacy/current `ChunkMesher` path using the same section fixtures.

Greedy merge keys must include every attribute that changes visible output: block/material/texture face, orientation, light values, AO pattern, biome tint class, transparency class and animation class. Merging faces that differ in lighting/AO produces obvious seams or wrong gradients.

For highly irregular/model-like blocks, do not force greedy voxel quads. Use small baked templates or instancing where repeated objects share geometry/material.

## Draw-call control

Primary objective: **one or a small bounded number of draw calls per visible section/material class**, not one mesh per block. Use `renderer.info` to record calls, triangles, geometries and textures per benchmark scene.

Use `InstancedMesh` for repeated non-voxel objects only when it genuinely reduces submission cost; contiguous terrain should remain section meshes.

## Lighting

The repository already has `BlockLightEngine`, `LightStorage`, `LightUpdateEngine`, `Lighting`, `AmbientOcclusion` and `LightSaturation`.

Target a clear separation:

- **skylight** propagation/state;
- **block light** emission/propagation;
- **time-of-day multiplier/color**;
- **per-vertex AO** from local occupancy;
- **biome tint** for grass/foliage/water;
- optional directional shadow map for the sun.

Do not use expensive screen-space ambient occlusion as a baseline requirement. Minecraft-like vertex AO is cheap, stable and aligns with voxel geometry. SSAO can be an optional High/Ultra experiment only after GPU budget exists.

### Lighting update contract
A block edit invalidates only affected light regions/section borders and remeshes dependent sections. Never trigger full-world relighting on an ordinary edit. Queue light propagation with a measurable work budget and version token so stale async results cannot overwrite newer state.

## Shadows

Current config exposes shadows, 1024 shadow map, 96-block shadow distance. Improve via tiering rather than simply raising resolution:

- stabilize directional-light shadow camera around the player;
- fit shadow bounds to useful region;
- bias/normal-bias carefully to avoid acne/peter-panning;
- lower distance/resolution dynamically on GPU-bound profiles;
- exclude objects that do not meaningfully contribute.

Cascaded shadows are a later option and should only be adopted if profiling proves the visual gain is worth extra passes/draw calls.

## Textures

For a pixel-art voxel aesthetic:

- preserve nearest-neighbor sampling where appropriate;
- use mipmaps for distant terrain to reduce shimmer;
- consider texture arrays in WebGL2 when atlas bleeding/state complexity becomes limiting;
- keep animated textures data-driven;
- adopt KTX2/Basis Universal only when real imported texture content justifies compressed GPU-ready assets.

If the current procedural atlas remains tiny, KTX2 is not a priority. Compression is an optimization for asset footprint/upload, not a replacement for good mesh batching.

## Water/lava

Use `FluidSurfaceMesher` as the geometry foundation. Preferred shader features, tiered:

- animated UV/frame motion;
- depth/color attenuation approximation;
- view-angle Fresnel-like reflectance;
- subtle normal/flow distortion on higher tiers;
- underwater fog/color shift;
- no mandatory full-screen refraction pass on Low/Medium.

Avoid expensive real-time planar reflections by default.

## Sky, fog, atmosphere, weather

`Environment.ts` and day/night configuration already exist. Establish one shared environment state (`sunDirection`, sky/fog colors, exposure/brightness, precipitation state) consumed by terrain, entities, water and sky. This prevents each subsystem inventing its own day/night curve.

Recommended order:

1. physically coherent but stylized sky gradient;
2. sun/moon path and light intensity/color;
3. fog color synchronized to sky/time/weather;
4. stars and cloud layer;
5. rain/snow particles clipped to local columns;
6. lightning flashes and thunder timing.

## Post-processing

Do not make bloom, SSAO, motion blur, depth-of-field or TAA prerequisites. Voxel clarity often degrades under these. If added:

- expose each pass separately;
- record GPU time by pass;
- scale render target resolution;
- dispose render targets explicitly;
- ensure UI is composited after world effects.

## WebGL context robustness

The earlier audit flagged missing context-loss recovery. Revalidate. Renderer lifecycle should handle `webglcontextlost`/`webglcontextrestored`, pause simulation/render submission as appropriate, rebuild GPU resources from CPU/world state, and show recoverable UI. Three.js resource disposal must be explicit for geometries, materials, textures and render targets.

## Performance acceptance

At the target benchmark distance:

- GPU p95 world render <= 11 ms on reference mid-tier desktop at 1080p Medium;
- total frame p95 <= 16.7 ms for 60-FPS target, p99 <= 25 ms outside streaming stress scenes;
- draw calls p95 <= 300 Medium benchmark, aspirational <= 200;
- ordinary block edit GPU upload <= 1–2 section meshes, not a world-wide upload;
- no texture/geometry count growth after a load/unload round trip;
- quality-tier downgrade produces a measurable GPU-time improvement.