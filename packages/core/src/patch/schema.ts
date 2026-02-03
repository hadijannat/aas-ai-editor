/**
 * Patch Operation Schema
 *
 * Extends JSON Patch (RFC 6902) with AAS-specific metadata.
 */

/**
 * Approval tiers for patch operations
 */
export enum ApprovalTier {
  /** Metadata changes: descriptions, comments */
  LOW = 1,
  /** Structural changes within a submodel */
  MEDIUM = 2,
  /** Cross-reference changes, deletions */
  HIGH = 3,
  /** Identity changes: globalAssetId, AAS id */
  CRITICAL = 4,
}

/**
 * Base JSON Patch operation types
 */
export type JsonPatchOpType = 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';

/**
 * AAS-extended patch operation
 *
 * Combines RFC 6902 JSON Patch with AAS-specific metadata for
 * better AI context, validation linking, and approval workflows.
 */
export interface AasPatchOp {
  /** The operation type */
  op: JsonPatchOpType;

  /** JSON Pointer (RFC 6901) to the target location */
  path: string;

  /** Value for add/replace/test operations */
  value?: unknown;

  /** Source path for move/copy operations */
  from?: string;

  // --- AAS-specific extensions ---

  /** Semantic ID of the affected element (for context) */
  semanticId?: string;

  /** idShort of the affected element (for context) */
  idShort?: string;

  /** Model type of the affected element */
  modelType?: string;

  /** Human-readable explanation of this change */
  reason?: string;

  /** Whether this patch was AI-generated */
  aiGenerated?: boolean;

  /** Required approval tier */
  approvalTier?: ApprovalTier;

  /** Link to IDTA template constraint that validates this change */
  templateConstraint?: string;
}

/**
 * Result of applying patches
 */
export interface PatchResult<T = unknown> {
  /** Whether all patches applied successfully */
  success: boolean;

  /** The resulting document (if successful) */
  result?: T;

  /** Inverse patches for undo */
  inverse?: AasPatchOp[];

  /** Error message if failed */
  error?: string;

  /** Index of the failing patch (if failed) */
  failedAt?: number;
}

/**
 * Validate that a patch operation is well-formed
 */
export function validatePatchOp(patch: AasPatchOp): string | null {
  // Check required fields
  if (!patch.op) {
    return 'Patch operation must have an "op" field';
  }

  if (!patch.path) {
    return 'Patch operation must have a "path" field';
  }

  // Validate path format (JSON Pointer)
  if (!patch.path.startsWith('/') && patch.path !== '') {
    return 'Patch path must be a valid JSON Pointer (start with "/" or be empty)';
  }

  // Check operation-specific requirements
  switch (patch.op) {
    case 'add':
    case 'replace':
    case 'test':
      if (patch.value === undefined) {
        return `Patch operation "${patch.op}" requires a "value" field`;
      }
      break;
    case 'move':
    case 'copy':
      if (!patch.from) {
        return `Patch operation "${patch.op}" requires a "from" field`;
      }
      break;
    case 'remove':
      // No additional requirements
      break;
    default:
      return `Unknown patch operation: ${patch.op}`;
  }

  return null; // Valid
}
