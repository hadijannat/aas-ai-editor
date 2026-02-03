/**
 * MCP Response Factories
 *
 * Creates mock JSON-RPC responses for MCP tool calls.
 */

import type { Environment } from './types';

/**
 * Wrap a value in standard MCP JSON-RPC response format
 */
export function jsonRpcResponse(
  id: number,
  result: unknown
): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id,
    result: {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result),
        },
      ],
    },
  };
}

/**
 * Create a JSON-RPC error response
 */
export function jsonRpcError(
  id: number,
  code: number,
  message: string
): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id,
    error: { code, message },
  };
}

/**
 * Initialize response
 */
export function initializeResponse(id: number): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id,
    result: {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: { listChanged: false },
        resources: { listChanged: false },
      },
      serverInfo: {
        name: 'aas-ai-editor-mcp-mock',
        version: '0.1.0',
      },
    },
  };
}

/**
 * Document load response
 */
export function documentLoadResponse(
  id: number,
  options: {
    documentId?: string;
    filename?: string;
    shellCount?: number;
    submodelCount?: number;
    conceptCount?: number;
  } = {}
): Record<string, unknown> {
  return jsonRpcResponse(id, {
    documentId: options.documentId || 'test-doc-123',
    filename: options.filename || 'test.aasx',
    summary: {
      assetAdministrationShells: options.shellCount ?? 1,
      submodels: options.submodelCount ?? 1,
      conceptDescriptions: options.conceptCount ?? 0,
    },
  });
}

/**
 * Document status response
 */
export function documentStatusResponse(
  id: number,
  options: {
    canUndo?: boolean;
    canRedo?: boolean;
    dirty?: boolean;
  } = {}
): Record<string, unknown> {
  return jsonRpcResponse(id, {
    canUndo: options.canUndo ?? false,
    canRedo: options.canRedo ?? false,
    dirty: options.dirty ?? false,
  });
}

/**
 * Edit list pending response
 */
export function editListPendingResponse(
  id: number,
  pending: Array<{
    id: string;
    toolName: string;
    tier: number;
    reason: string;
    patches?: Array<{ op: string; path: string; value?: unknown }>;
  }> = []
): Record<string, unknown> {
  return jsonRpcResponse(id, {
    pending: pending.map((op) => ({
      ...op,
      createdAt: new Date().toISOString(),
      patches: op.patches || [],
    })),
  });
}

/**
 * Edit approve response
 */
export function editApproveResponse(
  id: number,
  count: number = 1
): Record<string, unknown> {
  return jsonRpcResponse(id, {
    approved: count,
    message: `Approved ${count} operation(s)`,
  });
}

/**
 * Edit reject response
 */
export function editRejectResponse(
  id: number,
  count: number = 1
): Record<string, unknown> {
  return jsonRpcResponse(id, {
    rejected: count,
    message: `Rejected ${count} operation(s)`,
  });
}

/**
 * Edit set property response
 */
export function editSetPropertyResponse(
  id: number,
  options: {
    operationId?: string;
    tier?: number;
    path?: string;
  } = {}
): Record<string, unknown> {
  return jsonRpcResponse(id, {
    operationId: options.operationId || 'op-123',
    tier: options.tier ?? 2,
    path: options.path || '/submodels/0/submodelElements/0/value',
    message: 'Property change queued for approval',
  });
}

/**
 * Validate fast response
 */
export function validateFastResponse(
  id: number,
  errors: Array<{ path: string; message: string; severity: string }> = []
): Record<string, unknown> {
  return jsonRpcResponse(id, {
    valid: errors.length === 0,
    errors,
    errorCount: errors.length,
  });
}

/**
 * Resource read response (for environment)
 */
export function resourceReadResponse(
  id: number,
  environment: Environment
): Record<string, unknown> {
  return {
    jsonrpc: '2.0',
    id,
    result: {
      contents: [
        {
          uri: 'aas://environment',
          mimeType: 'application/json',
          content: JSON.stringify(environment),
        },
      ],
    },
  };
}

/**
 * Query environment response
 */
export function queryEnvironmentResponse(
  id: number,
  environment: Environment
): Record<string, unknown> {
  return jsonRpcResponse(id, {
    environment,
    summary: {
      assetAdministrationShells:
        environment.assetAdministrationShells?.length ?? 0,
      submodels: environment.submodels?.length ?? 0,
      conceptDescriptions: environment.conceptDescriptions?.length ?? 0,
    },
  });
}

/**
 * Document save response
 */
export function documentSaveResponse(id: number): Record<string, unknown> {
  return jsonRpcResponse(id, {
    success: true,
    message: 'Document saved',
  });
}

/**
 * Document undo response
 */
export function documentUndoResponse(
  id: number,
  success: boolean = true
): Record<string, unknown> {
  return jsonRpcResponse(id, {
    success,
    message: success ? 'Undo successful' : 'Nothing to undo',
  });
}

/**
 * Document redo response
 */
export function documentRedoResponse(
  id: number,
  success: boolean = true
): Record<string, unknown> {
  return jsonRpcResponse(id, {
    success,
    message: success ? 'Redo successful' : 'Nothing to redo',
  });
}
