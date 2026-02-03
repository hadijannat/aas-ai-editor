/**
 * AAS-aware diff calculation
 *
 * Unlike generic JSON diff, this matches elements by semanticId/idShort
 * rather than array index, producing more meaningful diffs.
 */

export type { DiffResult, DiffEntry, DiffType } from './types.js';
export { calculateDiff } from './calculate.js';
export { formatDiff } from './format.js';
