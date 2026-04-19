/**
 * Standalone singleton for `TraceabilityMatrixService`.
 *
 * The package barrel (`./index.ts`) eagerly instantiates every document
 * parser (including ones that pull in `@electron-toolkit/utils` via
 * `skill-engine`), which prevents consumers that only need the matrix from
 * being imported in unit-test environments. This module exposes just the
 * matrix singleton so `chapter-structure-delete-service` can rebuild the
 * sidecar without dragging the whole parser graph into the test sandbox.
 */
import { TraceabilityMatrixService } from './traceability-matrix-service'

export const traceabilityMatrixService = new TraceabilityMatrixService()
