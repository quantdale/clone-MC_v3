/** Vite module-worker entry for deterministic canonical column generation. */
import { serveWorkerRequests } from '../rendering/WorkerJobProtocol';
import {
  processWorldgenColumnRequest,
  validateWorldgenRequest,
  type WorldgenRequestPayload,
} from './WorkerWorldgen';

serveWorkerRequests({
  worldgen: (payload) => ({
    payload: processWorldgenColumnRequest(
      validateWorldgenRequest(payload) as WorldgenRequestPayload,
    ),
  }),
});
