import type * as THREE from 'three';

/**
 * Result of meshing a chunk: up to one opaque and one transparent geometry.
 * Either may be absent when the chunk contains no faces of that category.
 */
export interface ChunkMeshResult {
  opaque: THREE.BufferGeometry | null;
  transparent: THREE.BufferGeometry | null;
}

/** World diagnostics exposed to the debug overlay. */
export interface WorldStats {
  loadedChunks: number;
  pendingGeneration: number;
  pendingMesh: number;
  triangles: number;
  voxels: number;
}