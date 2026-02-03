/**
 * Patch inversion for undo support
 */

import fastJsonPatch from 'fast-json-patch';
import type { Operation } from 'fast-json-patch';
const { getValueByPointer, applyPatch: jsonPatchApply } = fastJsonPatch;
import type { AasPatchOp } from './schema.js';
import { deepClone } from '../utils/polyfill.js';

/**
 * Create an inverse patch that undoes the given patch
 *
 * @param document - The document BEFORE the patch is applied
 * @param patch - The patch to invert
 * @returns The inverse patch, or undefined if not invertible
 */
export function invertPatch<T>(document: T, patch: AasPatchOp): AasPatchOp | undefined {
  switch (patch.op) {
    case 'add': {
      // Inverse of add is remove
      let removePath = patch.path;

      // Handle array append case: `/-` means "append to array"
      // The inverse needs the actual index where the element will be added
      if (patch.path.endsWith('/-')) {
        const parentPath = patch.path.slice(0, -2);
        const parent = parentPath ? getValueByPointer(document, parentPath) : document;
        if (Array.isArray(parent)) {
          // After the add, the element will be at index = current length
          removePath = `${parentPath}/${parent.length}`;
        }
      }

      return {
        op: 'remove',
        path: removePath,
        reason: `Undo: ${patch.reason || 'add operation'}`,
      };
    }

    case 'remove': {
      // Inverse of remove is add (with the original value)
      const originalValue = getValueByPointer(document, patch.path);
      return {
        op: 'add',
        path: patch.path,
        value: deepClone(originalValue),
        reason: `Undo: ${patch.reason || 'remove operation'}`,
      };
    }

    case 'replace': {
      // Inverse of replace is replace with original value
      const originalValue = getValueByPointer(document, patch.path);
      return {
        op: 'replace',
        path: patch.path,
        value: deepClone(originalValue),
        reason: `Undo: ${patch.reason || 'replace operation'}`,
      };
    }

    case 'move': {
      // Inverse of move is move back
      return {
        op: 'move',
        from: patch.path,
        path: patch.from!,
        reason: `Undo: ${patch.reason || 'move operation'}`,
      };
    }

    case 'copy': {
      // Inverse of copy is remove the copy
      return {
        op: 'remove',
        path: patch.path,
        reason: `Undo: ${patch.reason || 'copy operation'}`,
      };
    }

    case 'test': {
      // Test operations don't modify, no inverse needed
      return undefined;
    }

    default:
      return undefined;
  }
}

/**
 * Create inverse patches for a list of patches
 *
 * @param document - The document BEFORE patches are applied
 * @param patches - The patches to invert
 * @returns Inverse patches in reverse order (ready for undo)
 */
export function invertPatches<T>(document: T, patches: AasPatchOp[]): AasPatchOp[] {
  const inverses: AasPatchOp[] = [];

  // We need to apply patches incrementally to get correct inverses
  let current = deepClone(document);

  for (const patch of patches) {
    const inverse = invertPatch(current, patch);
    if (inverse) {
      inverses.unshift(inverse); // Prepend for correct undo order
    }

    // Apply the patch to get the next state
    // (simplified - in real implementation, use applyPatch)
    try {
      // This is a simplified version - actual implementation would use applyPatch
      current = applyPatchSimple(current, patch);
    } catch {
      // If patch fails, stop collecting inverses
      break;
    }
  }

  return inverses;
}

/**
 * Apply a patch for inverse calculation using fast-json-patch directly
 * This avoids circular dependency with apply.ts
 */
function applyPatchSimple<T>(document: T, patch: AasPatchOp): T {
  const cloned = deepClone(document);

  const operation: Operation = {
    op: patch.op,
    path: patch.path,
    value: patch.value,
    from: patch.from,
  } as Operation;

  const result = jsonPatchApply(cloned, [operation], true, false);
  return result.newDocument as T;
}
