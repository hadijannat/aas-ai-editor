/**
 * Patch application
 */

import fastJsonPatch from 'fast-json-patch';
import type { Operation } from 'fast-json-patch';
const { applyPatch: jsonPatchApply } = fastJsonPatch;
import { type AasPatchOp, type PatchResult, validatePatchOp } from './schema.js';
import { invertPatch } from './invert.js';
import { deepClone } from '../utils/polyfill.js';

/**
 * Apply a single patch to a document
 *
 * @param document - The document to patch (will be cloned)
 * @param patch - The patch to apply
 * @returns Result with the new document and inverse patch
 */
export function applyPatch<T>(document: T, patch: AasPatchOp): PatchResult<T> {
  // Validate the patch
  const validationError = validatePatchOp(patch);
  if (validationError) {
    return { success: false, error: validationError };
  }

  // Clone the document to avoid mutation
  const cloned = deepClone(document);

  try {
    // Calculate inverse before applying
    const inverse = invertPatch(cloned, patch);

    // Convert to fast-json-patch format
    const operation: Operation = {
      op: patch.op,
      path: patch.path,
      value: patch.value,
      from: patch.from,
    } as Operation;

    // Apply the patch
    const result = jsonPatchApply(cloned, [operation], true, false);

    return {
      success: true,
      result: result.newDocument as T,
      inverse: inverse ? [inverse] : undefined,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error applying patch',
    };
  }
}

/**
 * Apply multiple patches to a document atomically
 *
 * @param document - The document to patch (will be cloned)
 * @param patches - The patches to apply in order
 * @returns Result with the new document and inverse patches
 */
export function applyPatches<T>(document: T, patches: AasPatchOp[]): PatchResult<T> {
  if (patches.length === 0) {
    return { success: true, result: document, inverse: [] };
  }

  // Validate all patches first
  for (let i = 0; i < patches.length; i++) {
    const error = validatePatchOp(patches[i]);
    if (error) {
      return { success: false, error, failedAt: i };
    }
  }

  // Clone the document
  let current = deepClone(document);
  const inversePatches: AasPatchOp[] = [];

  // Apply patches one by one, collecting inverses
  for (let i = 0; i < patches.length; i++) {
    const patch = patches[i];

    try {
      // Calculate inverse before applying
      const inverse = invertPatch(current, patch);
      if (inverse) {
        inversePatches.unshift(inverse); // Prepend for correct undo order
      }

      // Convert to fast-json-patch format
      const operation: Operation = {
        op: patch.op,
        path: patch.path,
        value: patch.value,
        from: patch.from,
      } as Operation;

      // Apply the patch
      const result = jsonPatchApply(current, [operation], true, false);
      current = result.newDocument as T;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        failedAt: i,
      };
    }
  }

  return {
    success: true,
    result: current,
    inverse: inversePatches,
  };
}
