# 08 — Research Source Register

The roadmap favors primary specifications, official API documentation and upstream project documentation. Access dates should be refreshed when an implementation phase begins because browser/Three.js APIs evolve.

## Repository evidence

1. `package.json` — actual runtime/build/test dependencies and scripts.
2. `src/config/index.ts` — current chunk, physics, streaming, rendering and headless tunables.
3. `src/engine/Game.ts` — current composition/update/render ownership to trace before refactor.
4. `src/engine/GameLoop.ts` — rAF loop and frame-delta clamping.
5. `src/engine/SimulationClock.ts` — simulation timing abstraction requiring runtime wiring audit.
6. `src/engine/RenderInterpolator.ts` — render interpolation abstraction requiring runtime wiring audit.
7. `src/player/PlayerPhysics.ts` — authoritative custom player collision/gravity/substep logic.
8. `src/player/PlayerController.ts` — movement/input mapping.
9. `src/player/PlayerInteraction.ts` — break/place/target interaction path.
10. `src/world/BlockRegistry.ts`, `BlockStateRegistry.ts`, `BlockPropertySchema.ts` — block/state data model.
11. `src/world/Chunk.ts`, `ChunkColumn.ts`, `ChunkSection.ts`, `ChunkStatus.ts`, `ChunkTicket.ts` — world partition/lifecycle model.
12. `src/world/ChunkMesher.ts` and `src/rendering/GreedyMesher.ts` — mesh paths to benchmark/reconcile.
13. `src/rendering/AmbientOcclusion.ts`, `BlockLightEngine.ts`, `LightStorage.ts`, `LightUpdateEngine.ts` — lighting/AO implementation surface.
14. `src/rendering/FluidSurfaceMesher.ts`, `BiomeTint.ts`, `AnimatedTextureFrame.ts`, `Environment.ts`, `Lighting.ts` — visual-fidelity subsystems.
15. `src/rendering/MemoryResourceBudget.ts` — existing resource-budgeting foundation.
16. `FULL_AUDIT_REPORT.md` — historical August 7 codebase audit; useful leads, not a substitute for remeasurement.
17. `MINECRAFT_PARITY_MASTER_PLAN.md` and `PARITY_MATRIX.md` — prior parity planning to reconcile rather than duplicate.

## Three.js — official upstream

18. WebGLRenderer documentation — https://threejs.org/docs/#api/en/renderers/WebGLRenderer
   - renderer setup, pixel ratio, shadow maps, render info, disposal and WebGL behavior.
19. Three.js `WebGLRenderer` current docs — https://threejs.org/docs/pages/WebGLRenderer.html
20. Three.js `Info` — https://threejs.org/docs/pages/Info.html
   - draw calls/rendering resource statistics for benchmark overlay.
21. Three.js `BufferGeometry` — https://threejs.org/docs/#api/en/core/BufferGeometry
   - section mesh buffers, bounds, groups and disposal.
22. Three.js `BufferAttribute` — https://threejs.org/docs/#api/en/core/BufferAttribute
23. Three.js `InstancedMesh` — https://threejs.org/docs/pages/InstancedMesh.html
   - repeated object submission reduction.
24. Three.js `Frustum` — https://threejs.org/docs/#api/en/math/Frustum
25. Three.js `Texture` — https://threejs.org/docs/pages/Texture.html
26. Three.js `DataArrayTexture` — https://threejs.org/docs/#api/en/textures/DataArrayTexture
   - candidate WebGL2 texture-array path.
27. Three.js `ShaderMaterial` — https://threejs.org/docs/pages/ShaderMaterial.html
28. Three.js `WebGLRenderTarget` — https://threejs.org/docs/pages/WebGLRenderTarget.html
29. Three.js `EffectComposer` — https://threejs.org/docs/pages/EffectComposer.html
30. Three.js disposal guide — https://threejs.org/manual/en/how-to-dispose-of-objects.html
   - GPU resource lifecycle.
31. Three.js responsive/pixel-ratio guidance — https://threejs.org/manual/en/responsive.html

## WebGL/Khronos — specifications

32. WebGL 2.0 Specification — https://registry.khronos.org/webgl/specs/latest/2.0/
   - baseline graphics API; includes instancing, queries, array textures and core WebGL2 semantics.
33. WebGL registry — https://registry.khronos.org/webgl/
34. `EXT_disjoint_timer_query_webgl2` — https://registry.khronos.org/webgl/extensions/EXT_disjoint_timer_query_webgl2/
   - asynchronous GPU timing for profiling where supported.
35. `EXT_texture_filter_anisotropic` — https://registry.khronos.org/webgl/extensions/EXT_texture_filter_anisotropic/
36. KTX 2.0 specification — https://registry.khronos.org/KTX/specs/2.0/ktxspec.v2.html
   - GPU-friendly texture packaging, Basis Universal and supercompression.
37. Khronos KTX registry — https://registry.khronos.org/KTX/
38. glTF 2.0 specification — https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
   - relevant if entity/block-model assets migrate to an interchange format; not required for voxel terrain.

## Browser scheduling, workers and memory — standards/official docs

39. MDN `requestAnimationFrame` — https://developer.mozilla.org/docs/Web/API/Window/requestAnimationFrame
   - frame scheduling and background throttling behavior.
40. MDN Web Workers API — https://developer.mozilla.org/docs/Web/API/Web_Workers_API
41. MDN Using Web Workers — https://developer.mozilla.org/docs/Web/API/Web_Workers_API/Using_web_workers
42. MDN `Worker.postMessage` — https://developer.mozilla.org/docs/Web/API/Worker/postMessage
   - structured clone/transferable job transport.
43. MDN Transferable objects — https://developer.mozilla.org/docs/Web/API/Web_Workers_API/Transferable_objects
44. MDN `OffscreenCanvas` — https://developer.mozilla.org/docs/Web/API/OffscreenCanvas
   - future worker-rendering option; not first-line recommendation.
45. MDN `SharedArrayBuffer` — https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer
46. MDN `Atomics` — https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/Atomics
47. MDN `Window.crossOriginIsolated` — https://developer.mozilla.org/docs/Web/API/Window/crossOriginIsolated
   - deployment requirement/context for high-resolution memory/shared-memory APIs.
48. MDN Performance API — https://developer.mozilla.org/docs/Web/API/Performance_API
49. MDN `performance.now()` — https://developer.mozilla.org/docs/Web/API/Performance/now
50. MDN `PerformanceObserver` — https://developer.mozilla.org/docs/Web/API/PerformanceObserver
51. MDN Long Animation Frames API — https://developer.mozilla.org/docs/Web/API/Performance_API/Long_animation_frame_timing
52. MDN `measureUserAgentSpecificMemory()` — https://developer.mozilla.org/docs/Web/API/Performance/measureUserAgentSpecificMemory
53. MDN WebGL best practices — https://developer.mozilla.org/docs/Web/API/WebGL_API/WebGL_best_practices
54. MDN `WEBGL_lose_context` — https://developer.mozilla.org/docs/Web/API/WEBGL_lose_context
55. MDN `webglcontextlost` event — https://developer.mozilla.org/docs/Web/API/HTMLCanvasElement/webglcontextlost_event
56. MDN IndexedDB API — https://developer.mozilla.org/docs/Web/API/IndexedDB_API
57. MDN Page Visibility API — https://developer.mozilla.org/docs/Web/API/Page_Visibility_API
58. MDN Pointer Lock API — https://developer.mozilla.org/docs/Web/API/Pointer_Lock_API
59. MDN Gamepad API — https://developer.mozilla.org/docs/Web/API/Gamepad_API
60. MDN Web Audio API — https://developer.mozilla.org/docs/Web/API/Web_Audio_API

## WebGPU — standards/official docs, future track only

61. W3C WebGPU specification — https://www.w3.org/TR/webgpu/
62. W3C WGSL specification — https://www.w3.org/TR/WGSL/
63. MDN WebGPU API — https://developer.mozilla.org/docs/Web/API/WebGPU_API
64. Three.js WebGPURenderer documentation — https://threejs.org/manual/en/webgpurenderer.html

Use these to establish capability/experiment criteria, not to justify a premature renderer rewrite.

## Testing/build/security — official upstream

65. Vitest documentation — https://vitest.dev/guide/
66. Playwright documentation — https://playwright.dev/docs/intro
67. Playwright visual comparisons — https://playwright.dev/docs/test-snapshots
68. Vite build guide — https://vite.dev/guide/build.html
69. TypeScript handbook — https://www.typescriptlang.org/docs/handbook/intro.html
70. GitHub Actions documentation — https://docs.github.com/actions
71. GitHub dependency review — https://docs.github.com/code-security/supply-chain-security/understanding-your-software-supply-chain/about-dependency-review
72. GitHub Dependabot documentation — https://docs.github.com/code-security/dependabot
73. GitHub CodeQL documentation — https://docs.github.com/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning-with-codeql

## Minecraft legal/reference boundaries

74. Minecraft Usage Guidelines — https://www.minecraft.net/usage-guidelines
75. Minecraft EULA — https://www.minecraft.net/eula

These are mandatory constraints for naming, branding, distributed assets and commercialization decisions. The technical goal is behavioral/genre fidelity using original code/assets, not distribution of Mojang-owned content.

## Algorithmic primary literature

76. Amanatides & Woo, “A Fast Voxel Traversal Algorithm for Ray Tracing” (1987), Eurographics proceedings. Use the original paper/proceedings copy when implementing or validating DDA traversal.

### Source policy for implementation agents

- Prefer the repository itself for claims about current behavior.
- Prefer official/upstream docs/specs for APIs.
- Use Minecraft community references only for behavior values not specified by Mojang, and corroborate them with in-game measurement where possible.
- Never treat a forum answer or optimization blog as evidence that a change is faster in this codebase; benchmark it.
- Record source version/date in the ADR when a decision depends on a versioned browser/Three.js capability.