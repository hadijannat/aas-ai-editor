/**
 * Patch operations for AAS editing
 *
 * Based on JSON Patch (RFC 6902) with AAS-specific extensions.
 */

export type { AasPatchOp, PatchResult } from './schema.js';
export { ApprovalTier } from './schema.js';
export { createPatch, batchPatches } from './create.js';
export { applyPatch, applyPatches } from './apply.js';
export { invertPatch, invertPatches } from './invert.js';
export { classifyPatchTier } from './classify.js';
