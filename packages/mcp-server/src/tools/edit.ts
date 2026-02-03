/**
 * Edit Tools
 *
 * Tools for modifying AAS data through patch operations:
 * - Set property values
 * - Add/remove elements
 * - Move/copy elements
 * - Batch operations with approval workflow
 */

import { v4 as uuidv4 } from 'uuid';
import {
  applyPatches,
  classifyPatchTier,
  ApprovalTier,
  type AasPatchOp,
  type Environment,
} from '@aas-ai-editor/core';
import type { ToolDefinition, ToolResult, PendingOperation } from '../types.js';
import type { UndoEntry } from './document.js';

/**
 * Get tier name from enum value
 */
function getTierName(tier: ApprovalTier): string {
  switch (tier) {
    case ApprovalTier.LOW:
      return 'LOW';
    case ApprovalTier.MEDIUM:
      return 'MEDIUM';
    case ApprovalTier.HIGH:
      return 'HIGH';
    case ApprovalTier.CRITICAL:
      return 'CRITICAL';
    default:
      return 'UNKNOWN';
  }
}

/**
 * Set a property value
 */
const setPropertyValue: ToolDefinition = {
  name: 'edit_set_property',
  description: 'Set the value of a Property element.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'JSON Pointer path to the property (e.g., /submodels/0/submodelElements/0/value)',
      },
      value: {
        description: 'The new value to set',
      },
      reason: {
        type: 'string',
        description: 'Reason for this change (for audit trail)',
      },
    },
    required: ['path', 'value'],
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { path, value, reason } = params as {
      path: string;
      value: unknown;
      reason?: string;
    };
    const { session, logger } = context;

    if (!session.documentState) {
      return { success: false, error: 'No document loaded' };
    }

    logger.info({ path, reason }, 'Setting property value');

    // Create the patch
    const patch: AasPatchOp = {
      op: 'replace',
      path,
      value,
      reason: reason || 'Property value change',
      aiGenerated: true,
    };

    // Classify the patch tier
    const tier = classifyPatchTier(patch);
    patch.approvalTier = tier;

    // LOW tier changes can be auto-applied (metadata only)
    if (tier === ApprovalTier.LOW) {
      logger.info({ path, tier: 'LOW' }, 'Auto-applying low-tier change');

      const result = applyPatches(session.documentState.environment as Environment, [patch]);

      if (!result.success) {
        return {
          success: false,
          error: `Failed to apply change: ${result.error}`,
        };
      }

      // Update environment
      session.documentState.environment = result.result;
      session.documentState.dirty = true;

      // Add to undo stack
      const undoEntry: UndoEntry = {
        description: reason || `Set property at ${path}`,
        inversePatches: result.inverse || [],
        originalPatches: [patch],
      };
      session.documentState.undoStack.push(undoEntry);
      // Clear redo stack on new edit
      session.documentState.redoStack = [];

      return {
        success: true,
        data: {
          applied: true,
          autoApplied: true,
          tier: 'LOW',
          message: 'Change applied automatically (low-tier metadata change)',
        },
      };
    }

    // Higher tier changes require approval
    const operation: PendingOperation = {
      id: uuidv4(),
      toolName: 'edit_set_property',
      patches: [patch],
      approvalTier: tier,
      reason: reason || 'Property value change',
      createdAt: new Date(),
    };

    session.pendingOperations.push(operation);

    return {
      success: true,
      data: {
        operationId: operation.id,
        requiresApproval: true,
        tier: getTierName(tier),
        message: `Change queued for approval (${getTierName(tier)} tier)`,
      },
      pendingApproval: [operation],
    };
  },
};

/**
 * Add a new element
 */
const addElement: ToolDefinition = {
  name: 'edit_add_element',
  description: 'Add a new SubmodelElement to a submodel or collection.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'JSON Pointer path to the array (ending with /- to append)',
      },
      element: {
        type: 'object',
        description: 'The element to add (must include modelType, idShort)',
      },
      reason: {
        type: 'string',
        description: 'Reason for this addition',
      },
    },
    required: ['path', 'element'],
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { path, element, reason } = params as {
      path: string;
      element: Record<string, unknown>;
      reason?: string;
    };
    const { session, logger } = context;

    if (!session.documentState) {
      return { success: false, error: 'No document loaded' };
    }

    logger.info({ path, elementType: element.modelType }, 'Adding element');

    // Validate element has required fields
    if (!element.modelType || !element.idShort) {
      return {
        success: false,
        error: 'Element must have modelType and idShort',
      };
    }

    // Create the patch
    const patch: AasPatchOp = {
      op: 'add',
      path,
      value: element,
      modelType: element.modelType as string,
      idShort: element.idShort as string,
      reason: reason || `Add ${element.modelType} "${element.idShort}"`,
      aiGenerated: true,
    };

    // Classify the patch tier (add operations are usually MEDIUM)
    const tier = classifyPatchTier(patch);
    patch.approvalTier = tier;

    const operation: PendingOperation = {
      id: uuidv4(),
      toolName: 'edit_add_element',
      patches: [patch],
      approvalTier: tier,
      reason: patch.reason!,
      createdAt: new Date(),
    };

    session.pendingOperations.push(operation);

    return {
      success: true,
      data: {
        operationId: operation.id,
        requiresApproval: true,
        tier: getTierName(tier),
        element: {
          modelType: element.modelType,
          idShort: element.idShort,
        },
        message: `Element addition queued for approval (${getTierName(tier)} tier)`,
      },
      pendingApproval: [operation],
    };
  },
};

/**
 * Remove an element
 */
const removeElement: ToolDefinition = {
  name: 'edit_remove_element',
  description: 'Remove a SubmodelElement.',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'JSON Pointer path to the element to remove',
      },
      reason: {
        type: 'string',
        description: 'Reason for removal',
      },
    },
    required: ['path'],
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { path, reason } = params as { path: string; reason?: string };
    const { session, logger } = context;

    if (!session.documentState) {
      return { success: false, error: 'No document loaded' };
    }

    logger.info({ path }, 'Removing element');

    // Create the patch
    const patch: AasPatchOp = {
      op: 'remove',
      path,
      reason: reason || 'Element removal',
      aiGenerated: true,
    };

    // Remove operations are always HIGH or CRITICAL
    const tier = classifyPatchTier(patch);
    patch.approvalTier = tier;

    const operation: PendingOperation = {
      id: uuidv4(),
      toolName: 'edit_remove_element',
      patches: [patch],
      approvalTier: tier,
      reason: patch.reason!,
      createdAt: new Date(),
    };

    session.pendingOperations.push(operation);

    return {
      success: true,
      data: {
        operationId: operation.id,
        requiresApproval: true,
        tier: getTierName(tier),
        message: `Removal queued for approval (${getTierName(tier)} tier - destructive operation)`,
      },
      pendingApproval: [operation],
    };
  },
};

/**
 * Approve pending operations
 */
const approveOperations: ToolDefinition = {
  name: 'edit_approve',
  description: 'Approve pending operations to apply changes.',
  inputSchema: {
    type: 'object',
    properties: {
      operationIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'IDs of operations to approve (or "all" to approve all)',
      },
    },
    required: ['operationIds'],
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { operationIds } = params as { operationIds: string[] | 'all' };
    const { session, logger } = context;

    if (!session.documentState) {
      return { success: false, error: 'No document loaded' };
    }

    const idsToApprove =
      operationIds === 'all'
        ? session.pendingOperations.map((o) => o.id)
        : operationIds;

    const approved: Array<{ id: string; reason: string }> = [];
    const failed: Array<{ id: string; error: string }> = [];
    const remaining: PendingOperation[] = [];

    // Process each pending operation
    for (const op of session.pendingOperations) {
      if (!idsToApprove.includes(op.id)) {
        remaining.push(op);
        continue;
      }

      logger.info({ operationId: op.id, reason: op.reason }, 'Applying approved operation');

      // Collect all patches for this operation
      const patches = op.patches as AasPatchOp[];

      // Apply the patches
      const result = applyPatches(session.documentState.environment as Environment, patches);

      if (!result.success) {
        logger.error({ operationId: op.id, error: result.error }, 'Failed to apply operation');
        failed.push({ id: op.id, error: result.error || 'Unknown error' });
        // Keep failed operations in pending for retry
        remaining.push(op);
        continue;
      }

      // Update environment with the result
      session.documentState.environment = result.result;

      // Add to undo stack
      const undoEntry: UndoEntry = {
        description: op.reason,
        inversePatches: result.inverse || [],
        originalPatches: patches,
      };
      session.documentState.undoStack.push(undoEntry);

      // Clear redo stack on new edit
      session.documentState.redoStack = [];

      approved.push({ id: op.id, reason: op.reason });
    }

    // Update pending operations
    session.pendingOperations = remaining;

    // Mark document as dirty if any changes were applied
    if (approved.length > 0) {
      session.documentState.dirty = true;
    }

    return {
      success: failed.length === 0,
      data: {
        approved: approved.map((a) => a.id),
        approvedDetails: approved,
        failed: failed.length > 0 ? failed : undefined,
        remainingCount: remaining.length,
        canUndo: session.documentState.undoStack.length > 0,
        message:
          failed.length === 0
            ? `Successfully applied ${approved.length} operation(s)`
            : `Applied ${approved.length} operation(s), ${failed.length} failed`,
      },
      error: failed.length > 0 ? `${failed.length} operation(s) failed to apply` : undefined,
    };
  },
};

/**
 * Reject pending operations
 */
const rejectOperations: ToolDefinition = {
  name: 'edit_reject',
  description: 'Reject and discard pending operations.',
  inputSchema: {
    type: 'object',
    properties: {
      operationIds: {
        type: 'array',
        items: { type: 'string' },
        description: 'IDs of operations to reject (or "all")',
      },
      reason: {
        type: 'string',
        description: 'Reason for rejection',
      },
    },
    required: ['operationIds'],
  },
  handler: async (params, context): Promise<ToolResult> => {
    const { operationIds, reason } = params as {
      operationIds: string[] | 'all';
      reason?: string;
    };
    const { session, logger } = context;

    const idsToReject =
      operationIds === 'all'
        ? session.pendingOperations.map((o) => o.id)
        : operationIds;

    const rejected: string[] = [];
    session.pendingOperations = session.pendingOperations.filter((op) => {
      if (idsToReject.includes(op.id)) {
        logger.info({ operationId: op.id, reason }, 'Rejecting operation');
        rejected.push(op.id);
        return false;
      }
      return true;
    });

    return {
      success: true,
      data: {
        rejected,
        remainingCount: session.pendingOperations.length,
      },
    };
  },
};

/**
 * List pending operations
 */
const listPending: ToolDefinition = {
  name: 'edit_list_pending',
  description: 'List all pending operations awaiting approval.',
  inputSchema: {
    type: 'object',
    properties: {},
  },
  handler: async (_params, context): Promise<ToolResult> => {
    const { session } = context;

    return {
      success: true,
      data: {
        pending: session.pendingOperations.map((op) => ({
          id: op.id,
          toolName: op.toolName,
          tier: op.approvalTier,
          reason: op.reason,
          createdAt: op.createdAt.toISOString(),
          patchCount: op.patches.length,
          patches: op.patches,
        })),
      },
    };
  },
};

export const editTools: ToolDefinition[] = [
  setPropertyValue,
  addElement,
  removeElement,
  approveOperations,
  rejectOperations,
  listPending,
];
