/**
 * Vite module-worker entry for section meshing (Phase 11.1). Installs the unified-protocol request
 * server with a single `mesh-section` handler: validate → mesh → pack into a transferable
 * Float32Array. The worker never touches THREE; the packed result is expanded on the main thread.
 */
import { serveWorkerRequests, collectTransferables } from './WorkerJobProtocol';
import {
  processMeshSectionRequest,
  validateMeshSectionRequest,
  validateMeshSectionResult,
  packQuadsToTypedArrays,
} from './WorkerMeshing';

serveWorkerRequests({
  'mesh-section': (payload) => {
    const result = validateMeshSectionResult(
      processMeshSectionRequest(validateMeshSectionRequest(payload)),
    );
    const packed = packQuadsToTypedArrays(result.quads);
    return {
      payload: {
        sectionX: result.sectionX,
        sectionY: result.sectionY,
        sectionZ: result.sectionZ,
        data: packed.data,
        quadCount: packed.quadCount,
        stride: packed.stride,
      },
      transfer: collectTransferables([packed.data]),
    };
  },
});
