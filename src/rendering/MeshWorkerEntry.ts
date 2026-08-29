/**
 * Vite module-worker entry for section meshing (Phase 11.1). Installs the unified-protocol request
 * server with a single `mesh-section` handler: validate → mesh → pack into a transferable
 * Float32Array. The worker never touches THREE; the packed result is expanded on the main thread.
 */
import { serveWorkerRequests, collectTransferables } from './WorkerJobProtocol';
import { validateMeshWorkerRegistryTable, type MeshWorkerRegistryTable } from './MeshWorkerRegistry';
import {
  processMeshSectionRequest,
  validateMeshSectionRequest,
  validateMeshSectionResult,
  packQuadsToTypedArrays,
} from './WorkerMeshing';

let meshRegistryTable: MeshWorkerRegistryTable | undefined;

serveWorkerRequests({
  'mesh-section': (payload) => {
    const result = validateMeshSectionResult(
      processMeshSectionRequest(validateMeshSectionRequest(payload, meshRegistryTable)),
    );
    const packed = packQuadsToTypedArrays(result.quads);
    return {
      payload: {
        sectionX: result.sectionX,
        sectionY: result.sectionY,
        sectionZ: result.sectionZ,
        versionSnapshot: result.versionSnapshot,
        data: packed.data,
        quadCount: packed.quadCount,
        stride: packed.stride,
        streamNames: packed.streamNames,
      },
      transfer: collectTransferables([packed.data]),
    };
  },
}, undefined, {
  onInitialize: (kind, payload) => {
    if (kind !== 'mesh-section') return;
    const nextTable = validateMeshWorkerRegistryTable(payload);
    if (meshRegistryTable === undefined) {
      meshRegistryTable = nextTable;
      return;
    }
    if (meshRegistryTable.tableId !== nextTable.tableId) {
      throw new Error('MeshWorkerEntry: registry table replacement is not allowed');
    }
  },
});
