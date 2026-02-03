/**
 * Patch creation helpers
 */

import { type AasPatchOp, type JsonPatchOpType, ApprovalTier } from './schema.js';

/**
 * Create a single patch operation
 *
 * @param op - The operation type
 * @param path - JSON Pointer path
 * @param value - Value for add/replace operations
 * @param options - Additional AAS metadata
 * @returns The patch operation
 *
 * @example
 * ```ts
 * const patch = createPatch('replace', '/submodels/0/submodelElements/3/value', 'NewValue', {
 *   reason: 'Update manufacturer name',
 *   semanticId: '0173-1#02-AAO677#002'
 * });
 * ```
 */
export function createPatch(
  op: JsonPatchOpType,
  path: string,
  value?: unknown,
  options: Partial<Omit<AasPatchOp, 'op' | 'path' | 'value'>> = {}
): AasPatchOp {
  const patch: AasPatchOp = { op, path };

  if (value !== undefined) {
    patch.value = value;
  }

  // Merge additional options
  return { ...patch, ...options };
}

/**
 * Create a replace patch
 */
export function createReplacePatch(
  path: string,
  value: unknown,
  reason?: string
): AasPatchOp {
  return createPatch('replace', path, value, { reason });
}

/**
 * Create an add patch
 */
export function createAddPatch(
  path: string,
  value: unknown,
  reason?: string
): AasPatchOp {
  return createPatch('add', path, value, { reason });
}

/**
 * Create a remove patch
 */
export function createRemovePatch(path: string, reason?: string): AasPatchOp {
  return createPatch('remove', path, undefined, { reason, approvalTier: ApprovalTier.HIGH });
}

/**
 * Batch multiple patches into a group
 *
 * @param patches - Patches to batch
 * @param groupReason - Shared reason for the group
 * @returns Array of patches with shared metadata
 */
export function batchPatches(patches: AasPatchOp[], groupReason?: string): AasPatchOp[] {
  if (!groupReason) return patches;

  return patches.map((patch) => ({
    ...patch,
    reason: patch.reason || groupReason,
  }));
}

/**
 * Create patches for updating a property value
 *
 * @param basePath - Path to the property element
 * @param newValue - New value string
 * @param reason - Reason for the change
 */
export function createPropertyValuePatch(
  basePath: string,
  newValue: string,
  reason?: string
): AasPatchOp {
  return createPatch('replace', `${basePath}/value`, newValue, { reason });
}

/**
 * Create patches for adding a new submodel element
 *
 * @param submodelPath - Path to the submodel
 * @param element - The element to add
 * @param reason - Reason for the addition
 */
export function createAddElementPatch(
  submodelPath: string,
  element: unknown,
  reason?: string
): AasPatchOp {
  return createPatch('add', `${submodelPath}/submodelElements/-`, element, {
    reason,
    approvalTier: ApprovalTier.MEDIUM,
  });
}
